<?php

namespace App\Support;

/** Regroup existing entries before AdminLTE applies its permission filters. */
class WorkspaceNavigation
{
    public static function build(array $menu): array
    {
        $top = []; $groups = array_fill_keys(['workspace', 'sales', 'production', 'supply', 'quality', 'management', 'system'], []);
        $mapping = [
            'companies_trans_key' => 'sales', 'leads_trans_key' => 'sales', 'opportunities_trans_key' => 'sales',
            'quote_trans_key' => 'sales', 'orders_trans_key' => 'sales',
            'scheduling_trans_key' => 'production', 'methods_trans_key' => 'production', 'GMAO' => 'production',
            'product_trans_key' => 'supply', 'products_trans_key' => 'supply', 'purchase_trans_key' => 'supply',
            'quality_trans_key' => 'quality', 'delivery_notes_trans_key' => 'quality', 'osh_trans_key' => 'quality',
            'invoices_trans_key' => 'management', 'accounting_trans_key' => 'management', 'Reports' => 'management',
            'human_resources_trans_key' => 'management', 'settings_time_trans_key' => 'management',
            'documents_trans_key' => 'workspace', 'Tableurs' => 'workspace', 'whiteboard_trans_key' => 'workspace',
        ];
        $home = ['text' => '工作台', 'url' => 'dashboard', 'icon' => 'fas fa-th-large', 'active' => ['home', 'dashboard', '*/home', '*/dashboard']];
        $presales = ['text' => '售前工作台', 'url' => 'presales', 'icon' => 'far fa-folder-open', 'active' => ['presales', 'presales/*', '*/presales', '*/presales/*']];
        foreach ($menu as $item) {
            if (!is_array($item) || isset($item['header']) || !isset($item['text']) && empty($item['type'])) { continue; }
            $text = $item['text'] ?? '';
            if ($text === 'dashboard_trans_key' || $text === '售前工作台') { continue; }
            if (!empty($item['topnav']) || !empty($item['topnav_right'])) {
                if (!empty($item['type'])) { $top[] = $item; continue; }
                unset($item['topnav'], $item['topnav_right'], $item['classes']);
            }
            if (!empty($item['submenu']) && !empty($item['url'])) {
                $found = collect($item['submenu'])->contains(fn ($child) => ($child['url'] ?? null) === $item['url']);
                // MenuServiceProvider inserts the order list with its live count.
                if (!$found && $text !== 'orders_trans_key') { array_unshift($item['submenu'], ['text' => '查看全部', 'url' => $item['url']]); }
            }
            $groups[$mapping[$text] ?? 'system'][] = $item;
        }
        $result = [...$top, $home, $presales];
        $labels = ['workspace' => ['协作与资料', 'far fa-copy'], 'sales' => ['销售与客户', 'far fa-handshake'],
            'production' => ['计划与制造', 'fas fa-layer-group'], 'supply' => ['采购与仓储', 'fas fa-boxes'],
            'quality' => ['质量与交付', 'far fa-check-circle'], 'management' => ['经营与管理', 'far fa-chart-bar'], 'system' => ['设置与工具', 'fas fa-sliders-h']];
        foreach ($labels as $key => [$text, $icon]) {
            if ($groups[$key]) { $result[] = ['text' => $text, 'icon' => $icon, 'submenu' => $groups[$key]]; }
        }
        return $result;
    }
}
