import Toastify from "../../../lib/zero-dependencies/toastify/toastify-es.js";
import {
  Tabulator,
  TooltipModule,
  ValidateModule,
  EditModule,
  InteractionModule,
  FrozenColumnsModule,
  MenuModule,
  ResizeColumnsModule,
  SortModule,
  FilterModule,
  FormatModule,
  SelectRowModule,
  SelectRangeModule,
  KeybindingsModule,
} from "../../../lib/zero-dependencies/tabulator/tabulator_esm.js";

Tabulator.registerModule([
  TooltipModule,
  ValidateModule,
  EditModule,
  MenuModule,
  InteractionModule,
  FrozenColumnsModule,
  ResizeColumnsModule,
  SortModule,
  FilterModule,
  FormatModule,
  SelectRowModule,
  SelectRangeModule,
  KeybindingsModule,
]);

const tr = (...args) => globalThis.chrome?.i18n?.getMessage
  ? chrome.i18n.getMessage(...args)
  : (args[0] || '');

const removeTempRule = (rule) => new Promise((resolve, reject) => {
  window.OmegaTargetPopup.addTempRule(rule.domain, rule.profileName, -1, (error) => {
    if (error) reject(error);
    else resolve();
  });
});

const createDeleteButton = () => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-link btn-sm temp-delete-btn';
  button.title = tr('tempRules_action');
  button.setAttribute('aria-label', tr('tempRules_action'));
  button.innerHTML = '<span class="glyphicon glyphicon-trash" aria-hidden="true"></span>';
  return button;
};

const createTabulator = () => {
  const tempProfileRules = window.OmegaPopup.tempProfileRules || {};
  const rules = Object.keys(tempProfileRules).map((domain) => ({
    ...tempProfileRules[domain],
    domain
  }));

  const tabulatorInstance = new Tabulator(".list-container", {
    height: "100%",
    selectableRows: true,
    selectableRowsRangeMode: "click",
    data: rules,
    layout: "fitColumns",
    index: "domain",
    columnDefaults: {
      headerClick: (e, column) => {
        const def = column.getDefinition();
        if (!def.headerSort) return;
        const sorters = tabulatorInstance.getSorters();
        sorters.find((sorter) => {
          if (sorter.column === column && sorter.dir === 'asc') {
            const currSort = sorter.field + '_' + sorter.dir;
            if (tabulatorInstance.__prevSort === currSort) {
              tabulatorInstance.clearSort();
              tabulatorInstance.__prevSort = null;
            } else {
              tabulatorInstance.__prevSort = currSort;
            }
            return true;
          }
          return false;
        });
      }
    },
    resizableColumnGuide: true,
    placeholder: tr('tempRules_noData'),
    columns: [
      {
        formatter: "rowSelection",
        titleFormatter: "rowSelection",
        hozAlign: "center",
        headerSort: false,
        width: 50
      },
      {
        title: "#",
        width: 50,
        field: "domain",
        hozAlign: 'center',
        headerHozAlign: 'center',
        formatter: "rownum",
        headerSort: false,
        frozen: true
      },
      {
        title: tr('tempRules_domain'),
        field: "domain",
        minWidth: 180
      },
      {
        title: tr('tempRules_pattern'),
        field: "condition.pattern",
        minWidth: 180,
        headerSort: true
      },
      {
        title: tr('tempRules_profile'),
        field: "profileName",
        minWidth: 180
      },
      {
        title: tr('tempRules_action'),
        field: "domain",
        width: 70,
        hozAlign: "center",
        headerSort: false,
        formatter: () => createDeleteButton(),
        cellClick: async (e, cell) => {
          const rule = cell.getRow().getData();
          if (!window.confirm(tr('tempRules_deleteConfirm'))) return;
          try {
            await removeTempRule(rule);
            cell.getRow().delete();
            Toastify({ text: tr('tempRules_deleted'), position: 'center' }).showToast();
          } catch (error) {
            console.error('Unable to delete temporary rule', error);
            Toastify({ text: tr('tempRules_deleteError'), position: 'center' }).showToast();
          }
        }
      }
    ],
  });

  return new Promise((resolve) => {
    const onTableBuilt = () => {
      tabulatorInstance.off('tableBuilt', onTableBuilt);
      resolve(tabulatorInstance);
    };
    tabulatorInstance.on('tableBuilt', onTableBuilt);
  });
};

const initTempToolbar = (tabulatorInstance) => {
  const searchEl = document.getElementById('temp-search');
  const searchLabel = document.getElementById('temp-search-label');
  const countEl = document.getElementById('temp-rule-count');
  const countLabel = document.getElementById('temp-rule-count-label');
  const deleteAllBtn = document.getElementById('temp-delete-all');
  const deleteAllLabel = document.getElementById('temp-delete-all-label');
  const deleteSelectedBtn = document.getElementById('temp-delete-selected');
  const deleteSelectedLabel = document.getElementById('temp-delete-selected-label');
  let confirmTimer = null;
  let deleteArmed = false;

  const updateCount = () => {
    const rows = tabulatorInstance.getFilteredData?.() || tabulatorInstance.getData();
    if (countEl) countEl.textContent = String(rows.length);
  };

  const resetDeleteButton = () => {
    deleteArmed = false;
    clearTimeout(confirmTimer);
    deleteAllBtn?.classList.remove('confirming');
    if (deleteAllLabel) deleteAllLabel.textContent = tr('tempRules_deleteAll');
  };

  const updateSelectedButton = () => {
    const count = tabulatorInstance.getSelectedData().length;
    if (deleteSelectedBtn) deleteSelectedBtn.disabled = count === 0;
    if (deleteSelectedLabel) {
      deleteSelectedLabel.textContent = tr('tempRules_deleteSelected') + (count ? ` (${count})` : '');
    }
  };

  const deleteSelectedRules = async () => {
    const selectedRules = tabulatorInstance.getSelectedData();
    if (!selectedRules.length) return;
    if (!window.confirm(tr('tempRules_confirmDeleteSelected'))) return;
    deleteSelectedBtn.disabled = true;
    tabulatorInstance.alert(tr('tempRules_processing'));
    try {
      for (const rule of selectedRules) {
        await removeTempRule(rule);
        const row = tabulatorInstance.getRow(rule.domain);
        row?.delete();
      }
      Toastify({ text: tr('tempRules_deleted'), position: 'center' }).showToast();
    } catch (error) {
      console.error('Unable to delete selected temporary rules', error);
      Toastify({ text: tr('tempRules_deleteError'), position: 'center' }).showToast();
    } finally {
      tabulatorInstance.clearAlert();
      updateSelectedButton();
      updateCount();
    }
  };

  const deleteAllRules = async () => {
    if (!deleteAllBtn) return;
    deleteAllBtn.disabled = true;
    tabulatorInstance.alert(tr('tempRules_processing'));
    try {
      const rules = tabulatorInstance.getData();
      for (const rule of rules) {
        await removeTempRule(rule);
      }
      tabulatorInstance.clearData();
      Toastify({ text: tr('tempRules_deleted'), position: 'center' }).showToast();
    } catch (error) {
      console.error('Unable to delete temporary rules', error);
      Toastify({ text: tr('tempRules_deleteError'), position: 'center' }).showToast();
    } finally {
      tabulatorInstance.clearAlert();
      deleteAllBtn.disabled = false;
      resetDeleteButton();
      updateCount();
    }
  };

  if (searchEl) {
    searchEl.placeholder = tr('tempRules_searchPlaceholder');
    searchEl.addEventListener('input', () => {
      const query = searchEl.value.trim().toLowerCase();
      tabulatorInstance.setFilter((rule) => {
        if (!query) return true;
        return [
          rule.domain,
          rule.condition?.pattern,
          rule.profileName
        ].some((value) => String(value || '').toLowerCase().includes(query));
      });
      updateCount();
    });
  }
  if (searchLabel) searchLabel.textContent = tr('tempRules_searchPlaceholder');
  if (countLabel) countLabel.textContent = tr('tempRules_countLabel');
  if (deleteAllLabel) deleteAllLabel.textContent = tr('tempRules_deleteAll');

  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener('click', deleteSelectedRules);
    if (deleteSelectedLabel) deleteSelectedLabel.textContent = tr('tempRules_deleteSelected');
  }

  if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', () => {
      if (!deleteArmed) {
        deleteArmed = true;
        deleteAllBtn.classList.add('confirming');
        if (deleteAllLabel) deleteAllLabel.textContent = tr('tempRules_confirmDeleteAll');
        clearTimeout(confirmTimer);
        confirmTimer = setTimeout(resetDeleteButton, 4000);
        return;
      }
      deleteAllRules();
    });
  }

  ['rowAdded', 'rowDeleted', 'dataChanged', 'dataLoaded'].forEach((eventName) => {
    tabulatorInstance.on(eventName, updateCount);
  });
  tabulatorInstance.on('rowSelectionChanged', updateSelectedButton);
  updateSelectedButton();
  updateCount();
};

const init = async () => {
  const tabulatorInstance = await createTabulator();
  initTempToolbar(tabulatorInstance);
};

init();
