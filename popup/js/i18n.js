$script.ready('om-page-info', function() {
  document.querySelector('#js-addrule-label').textContent =
    OmegaTargetPopup.getMessage('popup_addCondition');
  document.querySelector('#js-option-label').textContent =
    OmegaTargetPopup.getMessage('popup_showOptions');
});
