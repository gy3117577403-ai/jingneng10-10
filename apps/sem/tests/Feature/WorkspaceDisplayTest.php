<?php
namespace Tests\Feature;

use App\Models\Quality\QualityAction;
use App\Services\QualityKPIService;
use App\Support\ThemeMode;
use Tests\TestCase;

class WorkspaceDisplayTest extends TestCase
{
    public function test_empty_quality_categories_do_not_report_one_hundred_percent_external(): void
    {
        $rates = app(QualityKPIService::class)->getInternalExternalRates();
        $this->assertSame([0, 0, 0, 0, 0, 0], array_values($rates));
    }

    public function test_quality_rates_still_reflect_actual_internal_and_external_records(): void
    {
        $user = \App\Models\User::factory()->create();
        QualityAction::create(['code' => 'UI-TEST-INTERNAL', 'label' => 'Internal example', 'type' => 1, 'statu' => 1, 'color' => '#607080', 'user_id' => $user->id]);
        QualityAction::create(['code' => 'UI-TEST-EXTERNAL', 'label' => 'External example', 'type' => 2, 'statu' => 1, 'color' => '#607080', 'user_id' => $user->id]);
        $rates = app(QualityKPIService::class)->getInternalExternalRates();
        $this->assertEquals(50, $rates['internalActionRate']);
        $this->assertEquals(50, $rates['externalActionRate']);
    }

    public function test_chinese_workspace_maps_legacy_neutral_theme_to_light_and_preserves_dark(): void
    {
        config(['app.locale' => 'zh-CN']); session([ThemeMode::SESSION_KEY => ThemeMode::PRO]);
        $this->assertSame(ThemeMode::LIGHT, ThemeMode::current());
        $this->assertSame('', ThemeMode::bodyClass());
        $this->assertSame(ThemeMode::LIGHT, ThemeMode::set(ThemeMode::PRO));
        $this->assertSame(ThemeMode::DARK, ThemeMode::set(ThemeMode::DARK));
        $this->assertSame(ThemeMode::DARK, ThemeMode::current());
    }
}
