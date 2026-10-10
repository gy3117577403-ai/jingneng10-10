<?php

namespace App\Providers;

use App\Models\Admin\Factory;
use App\Models\User;
use App\Models\Planning\Task;
use App\Models\Products\Products;
use App\Models\Products\StockMove;
use App\Models\Workflow\OrderLines;
use App\Models\Workflow\Orders;
use App\Models\Times\TimesAbsence;
use App\Observers\OrderLinesObserver;
use App\Observers\OrdersObserver;
use App\Observers\ProductsObserver;
use App\Observers\StockMoveObserver;
use App\Observers\TaskObserver;
use App\Observers\TimesAbsenceObserver;
use App\Services\SelectDataService;
use App\Services\Integrations\Pdp\PdpManager;
use App\Services\Integrations\Pdp\Drivers\QontoGateway;
use App\Services\Integrations\Pdp\Drivers\SuperPdpGateway;
use Illuminate\Console\Command;
use Illuminate\Pagination\Paginator;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\View;
use Illuminate\Support\ServiceProvider;
use JeroenNoten\LaravelAdminLte\Http\Controllers\DarkModeController;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(SelectDataService::class, function () {
            return new SelectDataService();
        });

        // Registre des drivers PDP (facturation électronique). Pour brancher
        // une nouvelle plateforme, enregistrer son driver ici.
        $this->app->singleton(PdpManager::class, function ($app) {
            $manager = new PdpManager();
            $manager->extend('qonto', $app->make(QontoGateway::class));
            $manager->extend('superpdp', $app->make(SuperPdpGateway::class));
            return $manager;
        });

        $this->app->resolving(Command::class, function (Command $command, $app) {
            $command->setLaravel($app);
        });
    }

    public function boot(): void
    {
        Paginator::useBootstrap();

        if (config('app.locale') === 'zh-CN') {
            Config::set('laravellocalization.supportedLocales', [
                'zh-CN' => ['name' => '简体中文', 'script' => 'Hans', 'native' => '简体中文', 'regional' => 'zh_CN'],
            ]);
            Config::set('adminlte.title', config('app.name'));
            Config::set('adminlte.logo', '<strong>京能制造</strong>');
            Config::set('adminlte.logo_img', 'img/jingneng-mark.svg');
            Config::set('adminlte.logo_img_alt', '京能制造');
            Config::set('branding.logo_short', '京能');
            $menu = array_values(array_filter(config('adminlte.menu', []),
                fn ($item) => !is_array($item) || ($item['text'] ?? '') !== 'language_trans_key'));
            foreach ($menu as &$item) {
                if (is_array($item) && isset($item['dropdown_flabel'])) {
                    $item['dropdown_flabel'] = '全部通知';
                }
            }
            unset($item);
            $menu = \App\Support\WorkspaceNavigation::build($menu);
            array_walk_recursive($menu, function (&$value, $key) {
                if (in_array($key, ['text', 'header', 'label']) && is_string($value)) {
                    $value = __($value);
                }
            });
            Config::set('adminlte.menu', $menu);
        }

        Orders::observe(OrdersObserver::class);
        Products::observe(ProductsObserver::class);
        Task::observe(TaskObserver::class);
        StockMove::observe(StockMoveObserver::class);
        OrderLines::observe(OrderLinesObserver::class);
        TimesAbsence::observe(TimesAbsenceObserver::class);

        if (config('branding.commercial')) {
            Config::set('mail.from.name', config('branding.app_name'));
            $this->overrideCommercialLogo();
        }

        Gate::define('viewPulse', function (User $user) {
            return $user->hasRole('Admin');
        });

        $this->syncSidebarWithDarkMode();
    }

    /**
     * AdminLTE ne lie pas le widget dark mode à la variante de sidebar : celle-ci
     * est figée dans 'adminlte.classes_sidebar'. On l'aligne ici sur la préférence
     * stockée en session, pour que la sidebar soit déjà à la bonne couleur au
     * chargement (la bascule sans rechargement est gérée en JS dans master.blade.php).
     */
    private function syncSidebarWithDarkMode(): void
    {
        View::composer('adminlte::partials.sidebar.left-sidebar', function () {
            $variant = (new DarkModeController())->isEnabled()
                ? 'sidebar-dark-primary'
                : 'sidebar-light-primary';

            Config::set('adminlte.classes_sidebar', $variant . ' elevation-4');
        });
    }

    private function overrideCommercialLogo(): void
    {
        $picture = Cache::rememberForever('branding_factory_logo', function () {
            return Factory::value('picture');
        });

        if ($picture) {
            Config::set('adminlte.logo_img', 'images/factory/' . $picture);
            Config::set('adminlte.logo_img_alt', config('branding.app_name'));
        }
    }
}
