<?php

namespace Tests\Feature;

use App\Support\MobileLauncher;
use App\Support\WorkspaceNavigation;
use Tests\TestCase;

class WorkspaceNavigationTest extends TestCase
{
    public function test_regrouping_preserves_urls_and_permission_metadata(): void
    {
        $entry = ['text' => 'quote_trans_key', 'url' => 'quotes', 'can' => 'quotes-menu', 'active' => ['quotes/*'],
            'submenu' => [['text' => 'quote_lines', 'url' => 'quotes/lines', 'can' => 'quote-lines']]];
        $menu = WorkspaceNavigation::build([$entry, ['type' => 'navbar-search', 'topnav_right' => true], ['header' => 'Old section']]);
        $sales = collect($menu)->firstWhere('text', '销售与客户');
        $this->assertSame('quotes-menu', $sales['submenu'][0]['can']);
        $this->assertSame(['quotes/*'], $sales['submenu'][0]['active']);
        $this->assertSame(['text' => '查看全部', 'url' => 'quotes'], $sales['submenu'][0]['submenu'][0]);
        $this->assertSame($entry['submenu'][0], $sales['submenu'][0]['submenu'][1]);
        $this->assertSame('navbar-search', $menu[0]['type']);

        $original = (require config_path('adminlte.php'))['menu'];
        $urls = function (array $items) use (&$urls): array {
            $result = [];
            foreach ($items as $item) {
                if (is_array($item)) {
                    if (!empty($item['url'])) $result[] = $item['url'];
                    $result = [...$result, ...$urls($item['submenu'] ?? [])];
                }
            }
            return array_values(array_unique($result));
        };
        $this->assertEmpty(array_diff($urls($original), $urls(WorkspaceNavigation::build($original))));
    }

    public function test_mobile_launcher_reaches_nested_pages_and_marks_active_record(): void
    {
        $groups = MobileLauncher::groups([['text' => '销售与客户', 'href' => '#', 'submenu' => [
            ['text' => '报价管理', 'href' => '#', 'submenu' => [
                ['text' => '报价清单', 'href' => '/quotes', 'target' => '_self'],
                ['text' => '报价明细', 'href' => '/quotes/lines', 'label' => 2],
            ]],
        ]]], 'zh-CN/quotes/lines/42');
        $app = MobileLauncher::current($groups);
        $this->assertSame('销售与客户', $app['text']);
        $this->assertSame(['/quotes', '/quotes/lines'], array_column($app['children'], 'href'));
        $this->assertSame([false, true], array_column($app['children'], 'active'));
        $this->assertStringContainsString('报价管理', $app['children'][1]['text']);
        $this->assertSame(2, $app['children'][1]['label']);
        $this->assertSame('_self', $app['children'][0]['target']);
    }
}
