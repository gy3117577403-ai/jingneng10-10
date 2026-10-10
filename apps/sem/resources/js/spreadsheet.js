import { translateUiText } from './lib/i18n.js';
// ─── CSS — ordre obligatoire ──────────────────────────────────────────────────
import '@univerjs/design/lib/index.css';
import '@univerjs/ui/lib/index.css';
import '@univerjs/docs-ui/lib/index.css';
import '@univerjs/sheets-ui/lib/index.css';
import '@univerjs/sheets-formula-ui/lib/index.css';
import '@univerjs/sheets-numfmt-ui/lib/index.css';

// ─── Core ─────────────────────────────────────────────────────────────────────
import {
    Univer,
    LocaleType,
    mergeLocales,
    UniverInstanceType,
} from '@univerjs/core';

// ─── Locales ──────────────────────────────────────────────────────────────────
import DesignZhCN            from '@univerjs/design/lib/locale/zh-CN';
import UIZhCN                from '@univerjs/ui/lib/locale/zh-CN';
import DocsZhCN              from '@univerjs/docs-ui/lib/locale/zh-CN';
import SheetsZhCN            from '@univerjs/sheets/lib/locale/zh-CN';
import SheetsUIZhCN          from '@univerjs/sheets-ui/lib/locale/zh-CN';
// Univer 1.x : les descriptions des fonctions (aide, autocomplétion) sont dans engine-formula
import EngineFormulaZhCN     from '@univerjs/engine-formula/lib/locale/zh-CN';
import SheetsFormulaCoreZhCN from '@univerjs/sheets-formula/lib/locale/zh-CN';
import SheetsFormulaZhCN     from '@univerjs/sheets-formula-ui/lib/locale/zh-CN';
import SheetsNumfmtZhCN      from '@univerjs/sheets-numfmt-ui/lib/locale/zh-CN';

// ─── Plugins ──────────────────────────────────────────────────────────────────
import { UniverRenderEnginePlugin }      from '@univerjs/engine-render';
import { UniverFormulaEnginePlugin }     from '@univerjs/engine-formula';
import { UniverUIPlugin }                from '@univerjs/ui';
import { UniverDocsPlugin }              from '@univerjs/docs';
import { UniverDocsUIPlugin }            from '@univerjs/docs-ui';
import { UniverSheetsPlugin }            from '@univerjs/sheets';
import { UniverSheetsUIPlugin }          from '@univerjs/sheets-ui';
import { UniverSheetsFormulaPlugin }     from '@univerjs/sheets-formula';
import { UniverSheetsFormulaUIPlugin }   from '@univerjs/sheets-formula-ui';
import { UniverSheetsNumfmtPlugin }      from '@univerjs/sheets-numfmt';
import { UniverSheetsNumfmtUIPlugin }    from '@univerjs/sheets-numfmt-ui';

// ─── Facades (API publique : save, événements) ────────────────────────────────
import { FUniver } from '@univerjs/core/facade';
import '@univerjs/sheets/facade';

import { WemFormulaPlugin } from './plugins/WemFormulaPlugin';

// ─── Init ─────────────────────────────────────────────────────────────────────
const config = window.WEM_SPREADSHEET;

if (!config || !document.getElementById('univer-container')) {
    console.error('WEM Spreadsheet: config ou container manquant');
} else {
    const univer = new Univer({
    locale: LocaleType.ZH_CN,
    locales: {
        [LocaleType.ZH_CN]: mergeLocales(
            DesignZhCN,
            UIZhCN,
            DocsZhCN,
            SheetsZhCN,
            SheetsUIZhCN,
            EngineFormulaZhCN,
            SheetsFormulaCoreZhCN,
            SheetsFormulaZhCN,
            SheetsNumfmtZhCN,
        ),
    },
});

    // ─── Ordre d'enregistrement obligatoire ───────────────────────────────────
    univer.registerPlugin(UniverRenderEnginePlugin);
    univer.registerPlugin(UniverFormulaEnginePlugin);

    univer.registerPlugin(UniverUIPlugin, {
        container: 'univer-container',
    });

    univer.registerPlugin(UniverDocsPlugin);
    univer.registerPlugin(UniverDocsUIPlugin);

    univer.registerPlugin(UniverSheetsPlugin);
    univer.registerPlugin(UniverSheetsUIPlugin);
    univer.registerPlugin(UniverSheetsFormulaPlugin);
    univer.registerPlugin(UniverSheetsFormulaUIPlugin);
    univer.registerPlugin(UniverSheetsNumfmtPlugin);
    univer.registerPlugin(UniverSheetsNumfmtUIPlugin);

    // ─── Charger les données existantes ───────────────────────────────────────
    const workbookData = {
        id: `spreadsheet-${config.id}`,
        name: config.name,
        sheetOrder: config.sheets.map((s, i) => s?.data?.id || `sheet-${i + 1}`),
        sheets: config.sheets.reduce((carry, sheet, index) => {
            const sheetId = sheet?.data?.id || `sheet-${index + 1}`;
            carry[sheetId] = {
                id: sheetId,
                name: sheet.name || `Feuille${index + 1}`,
                cellData: {},
                ...(sheet.data || {}),
            };
            return carry;
        }, {}),
    };

    univer.createUnit(UniverInstanceType.UNIVER_SHEET, workbookData);
    const univerAPI = FUniver.newAPI(univer);

    // ─── Plugin formules WEM ──────────────────────────────────────────────────
    const wemPlugin = new WemFormulaPlugin({ dataApiBase: config.dataApiBase });
    wemPlugin.register(univer);

    // ─── Auto-save ────────────────────────────────────────────────────────────
    const saveStatus = document.getElementById('save-status');
    let saveTimer = null;

    const setStatus = (text) => {
        if (saveStatus) saveStatus.textContent = text;
    };

    const saveWorkbook = async () => {
        setStatus(translateUiText("Enregistrement…"));

        const snapshot = univerAPI.getActiveWorkbook()?.save() ?? null;

        const res = await fetch(config.saveUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': config.csrfToken,
                Accept: 'application/json',
            },
            body: JSON.stringify({ snapshot }),
        });

        setStatus(res.ok ? translateUiText("Enregistré ✓") : translateUiText("Erreur de sauvegarde"));
    };

    const debounceSave = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveWorkbook().catch(() => setStatus(translateUiText("Erreur de sauvegarde")));
        }, 2000);
    };

    // Écoute des changements (undo/redo rejouent des mutations, qui passent ici aussi)
    univerAPI.addEvent(univerAPI.Event.CommandExecuted, () => debounceSave());
}