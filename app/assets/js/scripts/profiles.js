// profiles.js - manage create profile modal and creation
const ConfigManager = require('../configmanager')
const { LoggerUtil } = require('helios-core')
const logger = LoggerUtil.getLogger('Profiles')

// Elements
const createProfileBtn = document.getElementById('create_profile_button')
const createProfileModal = document.getElementById('createProfileModal')
const createProfileConfirm = document.getElementById('create_profile_confirm')
const createProfileCancel = document.getElementById('create_profile_cancel')
const profileSelectionBtn = document.getElementById('profile_selection_button')
const profilesListContainer = document.getElementById('profiles_list_container')

function showCreateProfile(){
    createProfileModal.style.display = 'flex'
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

createProfileConfirm.addEventListener('click', async e => {
    e.preventDefault()
    const name = document.getElementById('profile_name').value.trim()
    const mcver = document.getElementById('profile_mcversion').value.trim() || null
    const loader = document.getElementById('profile_loader').value || 'vanilla'
    const loaderv = document.getElementById('profile_loaderversion').value.trim() || null

    if(!name){
        alert('Veuillez fournir un nom pour le profil')
        return
    }
    if(!mcver){
        alert('Veuillez fournir une version Minecraft pour le profil')
        return
    }
    if(loader !== 'vanilla' && loader !== 'fabric'){
        alert('Seuls Vanilla et Fabric sont disponibles pour le moment')
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
        emptyState.innerHTML = '<span class="profilesEmptyTitle">Aucun profil local</span><span class="profilesEmptyText">Crée un profil Vanilla ou Fabric pour lancer une instance séparée.</span>'
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
