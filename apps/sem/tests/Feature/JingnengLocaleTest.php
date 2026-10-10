<?php

namespace Tests\Feature;

use App\Models\Workflow\Quotes;
use Tests\TestCase;

class JingnengLocaleTest extends TestCase
{
    public function test_quote_uses_the_configured_factory_currency(): void
    {
        config(['app.locale' => 'zh-CN']);
        $this->app->instance('Factory', (object) ['curency' => 'CNY']);
        $quote = new class extends Quotes {
            public function getTotalPriceAttribute() { return 1234.56; }
        };

        $this->assertStringContainsString('1,234.56', $quote->formatted_total_price);
        $this->assertStringNotContainsString('€', $quote->formatted_total_price);
        $this->assertMatchesRegularExpression('/[¥￥]/u', $quote->formatted_total_price);
    }

    public function test_validation_uses_a_chinese_field_label(): void
    {
        $this->app->setLocale('zh-CN');
        $validator = validator(['email' => 'invalid'], ['email' => 'required|email']);

        $this->assertTrue($validator->fails());
        $this->assertStringContainsString('邮箱', $validator->errors()->first('email'));
        $this->assertStringNotContainsString('email', $validator->errors()->first('email'));
    }
}
