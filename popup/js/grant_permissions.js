
const permissionValue = { origins: ['<all_urls>'] }
const permissionsError = document.getElementById('permissions-error')

function reportPermissionError(error) {
  permissionsError.textContent = '无法读取权限，请重新打开弹窗后再试。'
  permissionsError.hidden = false
  console.error('Unable to check proxy permissions', error)
}

async function updatePermissions() {
  const [hasPermission, isAllowedIncognitoAccess] = await Promise.all([
    browser.permissions.contains(permissionValue),
    !chrome.contextMenus || browser.extension.isAllowedIncognitoAccess()
  ])
  if (hasPermission) document.querySelector('.site-permissions-required')?.remove()
  if (isAllowedIncognitoAccess) document.querySelector('.incognito-access-required')?.remove()
  if (hasPermission && isAllowedIncognitoAccess) location.href = 'index.html'
}

window.addEventListener('load', async function() {
  const dialog = document.querySelector('.loading-dialog')
  dialog.addEventListener('cancel', event => event.preventDefault())
  dialog.showModal()
  try { await updatePermissions() }
  catch (error) { reportPermissionError(error) }
  finally { dialog.remove() }
}, { once: true })

const grantButton = document.getElementById('grant-permissions-btn')
grantButton.onclick = async () => {
  // Invoke directly from the click so the browser retains the user gesture.
  grantButton.disabled = true
  permissionsError.hidden = true
  try {
    if (await browser.permissions.request(permissionValue)) await updatePermissions()
  } catch (error) { reportPermissionError(error) }
  finally { grantButton.disabled = false }
}
