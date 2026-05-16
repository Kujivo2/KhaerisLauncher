const fs = require('fs-extra')
const got = require('got')
const path = require('path')
const { downloadQueue, getExpectedDownloadSize, MojangIndexProcessor } = require('helios-core/dl')
const { HeliosDistribution, MavenUtil, validateLocalFile } = require('helios-core/common')

const ConfigManager = require('./configmanager')

const FABRIC_META_ENDPOINT = 'https://meta.fabricmc.net/v2'
const FABRIC_MAVEN_ENDPOINT = 'https://maven.fabricmc.net/'
const HASH_ALGO_MD5 = 'md5'
const HASH_ALGO_SHA1 = 'sha1'

function normalizeRepoUrl(url) {
    return url.endsWith('/') ? url : `${url}/`
}

function libraryPath(commonDir, name) {
    return path.join(commonDir, 'libraries', MavenUtil.mavenIdentifierAsPath(name))
}

function libraryUrl(lib) {
    return normalizeRepoUrl(lib.url || FABRIC_MAVEN_ENDPOINT) + MavenUtil.mavenIdentifierAsPath(lib.name).replace(/\\/g, '/')
}

class LocalProfileBuilder {

    constructor(profile) {
        this.profile = profile
        this.commonDir = ConfigManager.getCommonDirectory()
        this.gameDir = ConfigManager.getProfileInstanceDirectory(profile)
        this.mojangProcessor = new MojangIndexProcessor(this.commonDir, profile.minecraftVersion)
        this.fabricManifest = null
        this.fabricLoaderVersion = profile.loaderVersion || null
    }

    static isLocalProfile(profile) {
        return profile != null && (profile.loader === 'vanilla' || profile.loader === 'fabric')
    }

    static getEffectiveJavaOptions(profile) {
        return ConfigManager.getProfileJavaOptions(profile)
    }

    rawDistribution() {
        const modules = []
        if(this.profile.loader === 'fabric') {
            modules.push({
                id: `net.fabricmc:fabric-loader:${this.fabricLoaderVersion}`,
                name: `Fabric Loader ${this.fabricLoaderVersion}`,
                type: 'Fabric',
                artifact: {
                    size: 0,
                    MD5: null,
                    url: `${FABRIC_MAVEN_ENDPOINT}net/fabricmc/fabric-loader/${this.fabricLoaderVersion}/fabric-loader-${this.fabricLoaderVersion}.jar`
                }
            })
        }

        return {
            version: 'local-profiles',
            discord: null,
            java: null,
            rss: null,
            servers: [
                {
                    id: this.profile.id,
                    name: this.profile.name,
                    description: 'Local profile',
                    icon: '',
                    version: 'local',
                    address: 'localhost',
                    minecraftVersion: this.profile.minecraftVersion,
                    mainServer: true,
                    autoconnect: false,
                    javaOptions: LocalProfileBuilder.getEffectiveJavaOptions(this.profile),
                    modules
                }
            ]
        }
    }

    async resolveFabricLoaderVersion() {
        if(this.fabricLoaderVersion != null) {
            return this.fabricLoaderVersion
        }

        const res = await got.get(`${FABRIC_META_ENDPOINT}/versions/loader/${this.profile.minecraftVersion}`, { responseType: 'json' })
        const loader = res.body.find(entry => entry.loader.stable) || res.body[0]
        if(loader == null) {
            throw new Error(`No Fabric loader is available for Minecraft ${this.profile.minecraftVersion}.`)
        }
        this.fabricLoaderVersion = loader.loader.version
        this.profile.loaderVersion = this.fabricLoaderVersion
        ConfigManager.saveProfiles()
        return this.fabricLoaderVersion
    }

    async loadFabricManifest() {
        if(this.profile.loader !== 'fabric') {
            return null
        }

        await this.resolveFabricLoaderVersion()
        const fabricVersionId = `${this.profile.minecraftVersion}-fabric-${this.fabricLoaderVersion}`
        const manifestPath = path.join(this.commonDir, 'versions', fabricVersionId, `${fabricVersionId}.json`)
        if(await fs.pathExists(manifestPath)) {
            this.fabricManifest = await fs.readJson(manifestPath)
            return this.fabricManifest
        }

        const url = `${FABRIC_META_ENDPOINT}/versions/loader/${this.profile.minecraftVersion}/${this.fabricLoaderVersion}/profile/json`
        const res = await got.get(url, { responseType: 'json' })
        this.fabricManifest = res.body
        await fs.ensureDir(path.dirname(manifestPath))
        await fs.writeJson(manifestPath, this.fabricManifest)
        return this.fabricManifest
    }

    async init() {
        await this.mojangProcessor.init()
        await this.loadFabricManifest()
        await fs.ensureDir(this.gameDir)
    }

    async validate(onStageComplete) {
        const invalid = []
        const mojangAssets = await this.mojangProcessor.validate(onStageComplete)
        Object.values(mojangAssets).flat().forEach(asset => invalid.push(asset))

        if(this.fabricManifest != null) {
            for(const asset of await this.validateFabricLibraries()) {
                invalid.push(asset)
            }
            await onStageComplete()
        }

        return invalid
    }

    async validateFabricLibraries() {
        const invalid = []
        for(const lib of this.fabricManifest.libraries || []) {
            if(lib.name == null || lib.url == null) {
                continue
            }

            const target = libraryPath(this.commonDir, lib.name)
            const hash = lib.sha1 || lib.md5 || null
            const algo = lib.sha1 ? HASH_ALGO_SHA1 : (lib.md5 ? HASH_ALGO_MD5 : HASH_ALGO_SHA1)
            if(!await validateLocalFile(target, algo, hash)) {
                invalid.push({
                    id: lib.name,
                    hash,
                    algo,
                    size: lib.size || 1,
                    url: libraryUrl(lib),
                    path: target
                })
            }
        }
        return invalid
    }

    async download(assets, onProgress) {
        if(assets.length === 0) {
            onProgress(100)
            return
        }

        const expectedTotalSize = Math.max(getExpectedDownloadSize(assets), assets.length)
        await downloadQueue(assets, received => {
            onProgress(Math.min(100, Math.trunc((received / expectedTotalSize) * 100)))
        })
        await this.mojangProcessor.postDownload()
    }

    async getLaunchData() {
        const versionData = await this.mojangProcessor.getVersionJson()
        const distro = new HeliosDistribution(this.rawDistribution(), this.commonDir, ConfigManager.getInstanceDirectory())
        const server = distro.getServerById(this.profile.id)
        return {
            server,
            versionData,
            modLoaderData: this.fabricManifest || versionData,
            gameDir: this.gameDir
        }
    }
}

module.exports = LocalProfileBuilder
