// profiles.js - manage create profile modal and creation
const ConfigManager = require('../configmanager')
const got = require('got')
const { LoggerUtil } = require('helios-core')
const logger = LoggerUtil.getLogger('Profiles')

const MOJANG_VERSION_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const FABRIC_LOADER_ENDPOINT = 'https://meta.fabricmc.net/v2/versions/loader'
const FORGE_METADATA_ENDPOINT = 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml'

// Elements
const createProfileBtn = document.getElementById('create_profile_button')
const createProfileModal = document.getElementById('createProfileModal')
const createProfileConfirm = document.getElementById('create_profile_confirm')
const createProfileCancel = document.getElementById('create_profile_cancel')
const profileSelectionBtn = document.getElementById('profile_selection_button')
const profilesListContainer = document.getElementById('profiles_list_container')
const profileMcVersion = document.getElementById('profile_mcversion')
const profileLoader = document.getElementById('profile_loader')
const profileLoaderVersion = document.getElementById('profile_loaderversion')
const profileVersionStatus = document.getElementById('profile_version_status')

let minecraftVersionsCache = null
let forgeVersionsCache = null

function setVersionStatus(text) {
    profileVersionStatus.textContent = text || ''
}

function setLoaderVersionOptions(options, emptyText) {
    profileLoaderVersion.innerHTML = ''
    if(emptyText != null) {
        const option = document.createElement('option')
        option.value = ''
        option.textContent = emptyText
        profileLoaderVersion.appendChild(option)
    }
    for(const entry of options) {
        const option = document.createElement('option')
        option.value = entry.value
        option.textContent = entry.label
        profileLoaderVersion.appendChild(option)
    }
}

async function loadMinecraftVersions() {
    if(minecraftVersionsCache != null) {
        return minecraftVersionsCache
    }

    const manifest = (await got.get(MOJANG_VERSION_MANIFEST, { responseType: 'json' })).body
    minecraftVersionsCache = manifest.versions.map(version => ({
        id: version.id,
        type: version.type
    }))
    return minecraftVersionsCache
}

async function loadForgeVersions() {
    if(forgeVersionsCache != null) {
        return forgeVersionsCache
    }

    const xml = (await got.get(FORGE_METADATA_ENDPOINT)).body
    forgeVersionsCache = Array.from(xml.matchAll(/<version>([^<]+)<\/version>/g), match => match[1])
    return forgeVersionsCache
}

async function populateMinecraftVersions() {
    setVersionStatus('Chargement des versions Minecraft...')
    const versions = await loadMinecraftVersions()
    profileMcVersion.innerHTML = ''
    for(const version of versions) {
        const option = document.createElement('option')
        option.value = version.id
        option.textContent = `${version.id}${version.type === 'snapshot' ? ' (snapshot)' : ''}`
        profileMcVersion.appendChild(option)
    }
    profileMcVersion.value = versions.find(version => version.type === 'release')?.id || versions[0]?.id || ''
    setVersionStatus('')
}

async function populateLoaderVersions() {
    const mcVersion = profileMcVersion.value
    const loader = profileLoader.value
    profileLoaderVersion.disabled = loader === 'vanilla'

    if(loader === 'vanilla') {
        setLoaderVersionOptions([], 'Vanilla')
        setVersionStatus('')
        return
    }

    if(!mcVersion) {
        setLoaderVersionOptions([], 'Choisis une version Minecraft')
        return
    }

    try {
        if(loader === 'fabric') {
            setVersionStatus('Chargement des loaders Fabric...')
            const loaders = (await got.get(`${FABRIC_LOADER_ENDPOINT}/${mcVersion}`, { responseType: 'json' })).body
            const options = loaders.map(entry => ({
                value: entry.loader.version,
                label: `${entry.loader.version}${entry.loader.stable ? ' (stable)' : ''}`
            }))
            setLoaderVersionOptions(options, options.length > 0 ? 'Auto stable' : 'Aucune version Fabric compatible')
        } else if(loader === 'forge') {
            setVersionStatus('Chargement des builds Forge...')
            const forgeVersions = await loadForgeVersions()
            const options = forgeVersions
                .filter(version => version.startsWith(`${mcVersion}-`))
                .map(version => ({
                    value: version,
                    label: version.substring(mcVersion.length + 1)
                }))
            setLoaderVersionOptions(options, options.length > 0 ? 'Dernière build Forge' : 'Aucune build Forge compatible')
        }
    } catch(err) {
        logger.error('Failed to load loader versions', err)
        setLoaderVersionOptions([], 'Impossible de charger les versions')
    } finally {
        setVersionStatus('')
    }
}

async function showCreateProfile(){
    createProfileModal.style.display = 'flex'
    if(minecraftVersionsCache == null) {
        try {
            await populateMinecraftVersions()
        } catch(err) {
            logger.error('Failed to load Minecraft versions', err)
            profileMcVersion.innerHTML = '<option value="">Impossible de charger les versions</option>'
            setVersionStatus('Vérifie ta connexion puis réessaie.')
        }
    }
    await populateLoaderVersions()
}
function hideCreateProfile(){
    createProfileModal.style.display = 'none'
}

createProfileBtn.addEventListener('click', e => {
    e.preventDefault()
    showCreateProfile()
})
createProfileCancel.addEventListener('click', e => {
    e.preventDefault()
    hideCreateProfile()
})

profileMcVersion.addEventListener('change', () => {
    populateLoaderVersions()
})

profileLoader.addEventListener('change', () => {
    populateLoaderVersions()
})

createProfileConfirm.addEventListener('click', async e => {
    e.preventDefault()
    const name = document.getElementById('profile_name').value.trim()
    const mcver = profileMcVersion.value || null
    const loader = profileLoader.value || 'vanilla'
    const loaderv = profileLoaderVersion.value || null

    if(!name){
        alert('Veuillez fournir un nom pour le profil')
        return
    }
    if(!mcver){
        alert('Veuillez fournir une version Minecraft pour le profil')
        return
    }
    if(loader !== 'vanilla' && loader !== 'fabric' && loader !== 'forge'){
        alert('Seuls Vanilla, Fabric et Forge sont disponibles pour le moment')
        return
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    const instanceDir = `${slug}-${Date.now()}`
    const profile = {
        id: `profile-${Date.now()}`,
        name: name,
        minecraftVersion: mcver,
        loader: loader,
        loaderVersion: loaderv,
        instanceDir: instanceDir
    }

    try{
        ConfigManager.createProfile(profile)
        ConfigManager.ensureProfileJavaConfig(profile)
        // select newly created profile
        ConfigManager.setSelectedProfile(profile.id)
        ConfigManager.save()
        alert('Profil créé: ' + name)
        logger.info('Created profile', profile)
        refreshProfileButton()
        refreshProfileList()
        hideCreateProfile()
    } catch(err){
        logger.error('Failed to create profile', err)
        alert('Erreur lors de la création du profil')
    }
})

function refreshProfileButton(){
    const sel = ConfigManager.getSelectedProfile()
    if(sel){
        profileSelectionBtn.innerHTML = `Profil: ${sel.name}`
    } else {
        profileSelectionBtn.innerHTML = 'Profil: Aucun'
    }
}

function refreshProfileList(){
    profilesListContainer.innerHTML = ''
    const profiles = ConfigManager.getProfiles()
    const selectedProfile = ConfigManager.getSelectedProfile()

    if(profiles.length === 0){
        const emptyState = document.createElement('div')
        emptyState.id = 'profilesEmptyState'
        emptyState.innerHTML = '<span class="profilesEmptyTitle">Aucun profil local</span><span class="profilesEmptyText">Crée un profil Vanilla, Fabric ou Forge pour préparer une instance séparée.</span>'
        profilesListContainer.appendChild(emptyState)
    } else {
        for(let p of profiles){
            const el = document.createElement('button')
            el.className = 'profileRow'
            el.type = 'button'
            if(selectedProfile?.id === p.id) {
                el.setAttribute('selected', '')
            }

            const name = document.createElement('span')
            name.className = 'profileName'
            name.textContent = p.name

            const meta = document.createElement('span')
            meta.className = 'profileMeta'
            meta.textContent = [p.minecraftVersion, p.loader, p.loaderVersion].filter(v => v != null && v !== '').join(' - ')

            el.appendChild(name)
            el.appendChild(meta)
            el.addEventListener('click', () => {
                ConfigManager.setSelectedProfile(p.id)
                ConfigManager.save()
                refreshProfileButton()
                refreshProfileList()
            })
            profilesListContainer.appendChild(el)
        }
    }
}

profileSelectionBtn.addEventListener('click', e => {
    e.preventDefault()
    profilesListContainer.scrollIntoView({ behavior: 'smooth', block: 'center' })
})

// Initialize button text on load
refreshProfileButton()
refreshProfileList()
