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
const profileSelectionModal = document.getElementById('profileSelectionModal')
const profilesListContainer = document.getElementById('profiles_list_container')
const profileSelectClose = document.getElementById('profile_select_close')

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
        // select newly created profile
        ConfigManager.setSelectedProfile(profile.id)
        ConfigManager.save()
        alert('Profil créé: ' + name)
        logger.info('Created profile', profile)
        refreshProfileButton()
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

function openProfileSelection(){
    profilesListContainer.innerHTML = ''
    const profiles = ConfigManager.getProfiles()
    if(profiles.length === 0){
        profilesListContainer.innerHTML = '<div>Aucun profil défini</div>'
    } else {
        for(let p of profiles){
            const el = document.createElement('div')
            el.className = 'profileRow'
            el.innerHTML = `<span class="profileName">${p.name}</span> <span class="profileMeta">${p.minecraftVersion || ''} ${p.loader || ''}</span>`
            const selBtn = document.createElement('button')
            selBtn.textContent = 'Sélectionner'
            selBtn.addEventListener('click', () => {
                ConfigManager.setSelectedProfile(p.id)
                ConfigManager.save()
                refreshProfileButton()
                profileSelectionModal.style.display = 'none'
            })
            el.appendChild(selBtn)
            profilesListContainer.appendChild(el)
        }
    }
    profileSelectionModal.style.display = 'flex'
}

profileSelectionBtn.addEventListener('click', e => {
    e.preventDefault()
    openProfileSelection()
})

profileSelectClose.addEventListener('click', e => {
    e.preventDefault()
    profileSelectionModal.style.display = 'none'
})

// Initialize button text on load
refreshProfileButton()
