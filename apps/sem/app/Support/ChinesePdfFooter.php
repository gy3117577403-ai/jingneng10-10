<?php

namespace App\Support;

class ChinesePdfFooter
{
    public static function apply($dompdf): void
    {
        $canvas = $dompdf->getCanvas();
        $metrics = $dompdf->getFontMetrics();
        $latin = $metrics->getFont('helvetica', 'normal');
        if (app()->getLocale() !== 'zh-CN') {
            $canvas->page_text(470, 778, 'Page {PAGE_NUM} / {PAGE_COUNT}', $latin, 7, [0.3, 0.3, 0.3]);
            return;
        }
        $chinese = $metrics->getFont('Jingneng CJK', 'normal');
        // The CJK fallback font need not include Latin digits. Measure each run.
        $canvas->page_script(function ($number, $count, $page, $fontMetrics) use ($latin, $chinese) {
            $x = 470;
            foreach ([['第', $chinese], [" $number / $count ", $latin], ['页', $chinese]] as [$text, $font]) {
                $page->text($x, 778, $text, $font, 7, [0.3, 0.3, 0.3]);
                $x += $fontMetrics->getTextWidth($text, $font, 7);
            }
        });
    }
}
