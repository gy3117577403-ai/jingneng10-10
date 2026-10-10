@if(!empty($customCss))
    <style type="text/css">
{!! $customCss !!}
    </style>
@endif

{{-- Local CJK font for Chinese demo documents; no external font request. --}}
@if(app()->getLocale() === 'zh-CN' && is_file(public_path('fonts/jingneng-cjk.ttf')))
    <style type="text/css">
        @font-face {
            font-family: 'Jingneng CJK';
            src: url('{{ public_path('fonts/jingneng-cjk.ttf') }}') format('truetype');
            font-weight: normal;
            font-style: normal;
        }
        @font-face {
            font-family: 'Jingneng CJK';
            src: url('{{ public_path('fonts/jingneng-cjk.ttf') }}') format('truetype');
            font-weight: bold;
            font-style: normal;
        }
        * { font-family: 'DejaVu Sans', 'Jingneng CJK', sans-serif; }
        header table { width: 100%; table-layout: fixed; }
        header td { vertical-align: top; padding: 8px; }
        header h2 { font-size: 20px; margin: 10px 0; }
        header h3 { font-size: 14px; margin: 10px 0; }
        header pre { white-space: pre-wrap; font-size: 12px; line-height: 1.25; margin: 0; }
        header img { max-height: 60px; max-width: 220px; }
        main table { font-size: 11px; }
        main th { padding: 8px 4px; }
        main td { padding: 6px 3px; }
        footer .pagenum-container { display: none; }
    </style>
@endif
