<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Admin\Factory;
use App\Models\Accounting\{AccountingVat, AccountingPaymentConditions, AccountingPaymentMethod, AccountingDelivery};
use App\Models\Companies\{Companies, CompaniesAddresses, CompaniesContacts};
use App\Models\Methods\{MethodsUnits, MethodsServices, MethodsSection, MethodsFamilies, MethodsRessources};
use App\Models\Products\{Products, Stocks, StockLocation};
use App\Models\Workflow\{Quotes, QuoteLines};
use App\Models\Planning\Task;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\{DB, Hash};
use Illuminate\Support\Str;
use Spatie\Permission\Models\{Role, Permission};

/** Deterministic fictional fixtures. Reruns preserve edited records and passwords. */
class JingnengDemoSeeder extends Seeder
{
    public function run(): void
    {
        $password = env('JINGNENG_DEMO_PASSWORD');
        if (!$password || strlen($password) < 16) {
            throw new \RuntimeException('Generate the local SEM configuration before seeding.');
        }
        DB::transaction(function () use ($password) {
            $this->call(PermissionTableSeeder::class);
            $role = Role::firstOrCreate(['name' => 'Admin', 'guard_name' => 'web']);
            $role->syncPermissions(Permission::all());
            $admin = User::firstOrCreate(['email' => env('JINGNENG_DEMO_EMAIL', 'admin@jingneng.demo')], [
                'name' => '演示管理员', 'password' => Hash::make($password), 'email_verified_at' => now(),
            ]);
            $admin->assignRole($role);
            $this->call(CompanyDataDemoSeeder::class);
            $vat = AccountingVat::firstOrCreate(['code' => 'DEMO-13'], ['label' => '演示税率 13%（待企业确认）', 'rate' => 13, 'default' => 1]);
            Factory::firstOrCreate(['name' => '京能制造示范企业（虚构资料）'], [
                'address' => '演示园区 1 号', 'city' => '演示城市', 'zipcode' => '000000', 'country' => 'CN',
                'mail' => 'demo@example.invalid', 'curency' => 'CNY', 'accounting_vats_id' => $vat->id,
                'add_day_validity_quote' => 30, 'add_delivery_delay_order' => 14, 'add_cgv_to_pdf' => 0, 'public_link_cgv' => 0,
            ]);
            $unit = MethodsUnits::firstOrCreate(['code' => 'UNIT'], ['label' => '件 / 台', 'type' => 5, 'default' => 1]);
            MethodsUnits::firstOrCreate(['code' => 'KG'], ['label' => '千克', 'type' => 1]);
            MethodsUnits::firstOrCreate(['code' => 'MM'], ['label' => '毫米', 'type' => 2]);
            $payment = AccountingPaymentConditions::firstOrCreate(['code' => 'DEMO-30'], ['label' => '演示：30 天', 'number_of_month' => 0, 'number_of_day' => 30, 'month_end' => 0, 'default' => 1]);
            $method = AccountingPaymentMethod::firstOrCreate(['code' => 'DEMO-BANK'], ['label' => '演示转账', 'default' => 1]);
            $delivery = AccountingDelivery::firstOrCreate(['code' => 'DEMO-DELIVERY'], ['label' => '演示送货', 'default' => 1]);
            $section = MethodsSection::firstOrCreate(['code' => 'DEMO-WORKSHOP'], ['label' => '演示制造车间', 'ordre' => 1, 'user_id' => $admin->id, 'color' => '#3575b9']);
            // Upstream services use these names as workflow keys, not translated labels.
            foreach (['Open', 'Started', 'In progress', 'Finished', 'Suspended', 'To RFQ', 'RFQ in progress', 'Outsourced', 'Supplied'] as $index => $title) {
                DB::table('statuses')->insertOrIgnore(['id' => $index + 1, 'title' => $title, 'order' => $index + 1]);
            }
            $serviceRows = [
                ['MAT', '演示板材', 3, 0], ['LAS', '激光下料', 1, 180], ['BEND', '折弯', 1, 100],
                ['WELD', '焊接', 1, 120], ['ASM', '装配接线', 1, 100], ['QC', '质量检验', 1, 80],
                ['PUR', '采购元件', 6, 0], ['COMPO', '组件', 8, 0], ['PAINT', '外协喷涂', 7, 0],
            ];
            $services = [];
            foreach ($serviceRows as $index => [$code, $label, $type, $rate]) {
                $service = MethodsServices::firstOrCreate(['code' => $code], ['ordre' => $index + 1, 'label' => $label, 'type' => $type, 'hourly_rate' => $rate, 'margin' => 0, 'color' => '#3575b9']);
                $services[$code] = $service;
                if ($type === 1) {
                    MethodsRessources::firstOrCreate(['code' => 'DEMO-' . $code], [
                        'ordre' => $index + 1, 'label' => $label . '工位（演示）', 'capacity' => 8,
                        'section_id' => $section->id, 'color' => '#3575b9', 'methods_services_id' => $service->id,
                    ]);
                }
            }
            $family = MethodsFamilies::firstOrCreate(['code' => 'DEMO-CABINET'], ['label' => '演示柜体与钣金', 'methods_services_id' => $services['COMPO']->id]);
            foreach (['RAW' => '演示原料仓', 'FIN' => '演示成品仓'] as $code => $label) {
                $stock = Stocks::firstOrCreate(['code' => 'DEMO-' . $code], ['label' => $label, 'user_id' => $admin->id]);
                StockLocation::firstOrCreate(['code' => 'DEMO-' . $code . '-A01'], ['label' => $label . ' A01', 'stocks_id' => $stock->id, 'user_id' => $admin->id]);
            }
            $this->call(DocumentCodeTemplateSeeder::class);
            $this->call(WorkShiftPatternSeeder::class);
            // Localize only untouched upstream fixtures; preserve edited schedules.
            $shiftTranslations = [
                'Journée (08h00-18h00)' => '白班（08:00–18:00）',
                'Horaires historiques : une seule plage continue, du lundi au vendredi.' => '演示工时：周一至周五每天一个连续班次。',
                'Une équipe : 06h00-14h00.' => '单班：06:00–14:00。',
                'Deux équipes : 06h00-14h00 et 14h00-22h00.' => '两班：06:00–14:00、14:00–22:00。',
                'Trois équipes, la nuit franchissant minuit : 22h00-06h00.' => '三班：早班、午班与跨日夜班（22:00–06:00）。',
            ];
            foreach ($shiftTranslations as $original => $chinese) {
                foreach (['label', 'comment'] as $field) {
                    DB::table('work_shift_patterns')->whereIn('code', ['JOURNEE', '1X8', '2X8', '3X8'])
                        ->where($field, $original)->update([$field => $chinese]);
                }
            }
            \App\Models\Admin\EstimatedBudgets::firstOrCreate(['year' => now()->year],
                array_fill_keys(array_map(fn ($month) => 'amount' . $month, range(1, 12)), 10000));
            $scenarios = [
                ['CT', '成套', '演示控制柜', 2, 6800, ['ASM', 'QC']],
                ['BJ', '钣金', '演示折弯支架', 20, 180, ['LAS', 'BEND', 'QC']],
            ];
            foreach ($scenarios as [$code, $kind, $label, $qty, $price, $routing]) {
                $company = Companies::firstOrCreate(['code' => 'DEMO-CUSTOMER-' . $code], [
                    'label' => '虚构客户 · ' . $kind, 'statu_customer' => 2, 'statu_supplier' => 1,
                    'user_id' => $admin->id, 'active' => 1, 'comment' => 'JN-0007 虚构演示，非真实客户。',
                ]);
                $address = CompaniesAddresses::firstOrCreate(['companies_id' => $company->id, 'label' => '演示收货地址'], [
                    'ordre' => 1, 'adress' => '演示园区 2 号', 'zipcode' => '000000', 'city' => '演示城市', 'country' => 'CN', 'default' => 1,
                ]);
                $contact = CompaniesContacts::firstOrCreate(['companies_id' => $company->id, 'mail' => strtolower($code) . '@example.invalid'], [
                    'ordre' => 1, 'civility' => 1, 'first_name' => '演示', 'name' => '联系人', 'function' => '采购', 'default' => 1,
                ]);
                $product = Products::firstOrCreate(['code' => 'DEMO-PRODUCT-' . $code], [
                    'label' => $label . '（虚构）', 'methods_services_id' => $services['COMPO']->id,
                    'methods_families_id' => $family->id, 'methods_units_id' => $unit->id, 'sold' => 1,
                    'selling_price' => $price, 'purchased' => 0, 'material' => '演示：冷轧钢板',
                    'thickness' => 2, 'comment' => '演示参数与价格，不用于生产或实际报价。',
                ]);
                $quote = Quotes::firstOrCreate(['code' => 'DEMO-Q-' . $code], [
                    'uuid' => (string) Str::uuid(), 'label' => $kind . '示范报价（虚构）',
                    'customer_reference' => 'DEMO-' . $code, 'companies_id' => $company->id,
                    'companies_contacts_id' => $contact->id, 'companies_addresses_id' => $address->id,
                    'validity_date' => now()->addDays(30)->toDateString(), 'statu' => 1, 'user_id' => $admin->id,
                    'accounting_payment_conditions_id' => $payment->id, 'accounting_payment_methods_id' => $method->id,
                    'accounting_deliveries_id' => $delivery->id, 'comment' => '全部内容为虚构演示；成本、税率和交期不是企业正式规则。',
                ]);
                $line = QuoteLines::firstOrCreate(['quotes_id' => $quote->id, 'code' => $product->code], [
                    'ordre' => 1, 'product_id' => $product->id, 'label' => $product->label, 'qty' => $qty,
                    'methods_units_id' => $unit->id, 'selling_price' => $price, 'discount' => 0,
                    'accounting_vats_id' => $vat->id, 'delivery_date' => now()->addDays(14)->toDateString(), 'statu' => 1,
                ]);
                foreach ($routing as $index => $operation) {
                    Task::firstOrCreate(['quote_lines_id' => $line->id, 'ordre' => $index + 1], [
                        'label' => $services[$operation]->label, 'methods_services_id' => $services[$operation]->id,
                        'seting_time' => 0.25, 'unit_time' => 0.1, 'type' => 1, 'qty' => 1,
                        'methods_units_id' => $unit->id, 'status_id' => 1,
                    ]);
                }
            }
            $supplier = Companies::firstOrCreate(['code' => 'DEMO-SUPPLIER'], [
                'label' => '虚构供应商 · 板材与元件', 'statu_customer' => 1, 'statu_supplier' => 2,
                'user_id' => $admin->id, 'active' => 1, 'comment' => '演示供应商，不发送真实订单。',
            ]);
            CompaniesAddresses::firstOrCreate(['companies_id' => $supplier->id, 'label' => '演示供货地址'], [
                'ordre' => 1, 'adress' => '演示材料园区 3 号', 'zipcode' => '000000', 'city' => '演示城市', 'country' => 'CN', 'default' => 1,
            ]);
            CompaniesContacts::firstOrCreate(['companies_id' => $supplier->id, 'mail' => 'supplier@example.invalid'], [
                'ordre' => 1, 'first_name' => '演示', 'name' => '供应商联系人', 'default' => 1,
            ]);
            Products::firstOrCreate(['code' => 'DEMO-SHEET-2MM'], [
                'label' => '演示冷轧钢板 2mm', 'methods_services_id' => $services['MAT']->id,
                'methods_families_id' => $family->id, 'methods_units_id' => $unit->id,
                'purchased' => 1, 'purchased_price' => 200, 'sold' => 0, 'material' => '演示钢板',
                'thickness' => 2, 'x_size' => 2000, 'y_size' => 1000, 'comment' => '虚构材料与价格。',
            ]);
        });
        $this->call(JingnengPresalesSeeder::class);
        $this->command->info('Chinese fictional SEM fixtures ready; existing records preserved.');
    }
}
