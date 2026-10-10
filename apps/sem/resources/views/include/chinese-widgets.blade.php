@if(app()->getLocale() === 'zh-CN')
<style>
    html[lang^="zh"] .custom-file-label:not([data-browse])::after { content: '选择文件'; }
</style>
<script>
    // Configure component language without rewriting DOM content or user data.
    (() => {
        const $ = window.jQuery;
        if (!$) return;
        if ($.fn.select2) {
            $.fn.select2.defaults.set('language', {
                errorLoading: () => '无法加载结果。',
                inputTooLong: args => `请删除多出的 ${args.input.length - args.maximum} 个字符。`,
                inputTooShort: args => `请再输入 ${args.minimum - args.input.length} 个字符。`,
                loadingMore: () => '正在加载更多…',
                maximumSelected: args => `最多选择 ${args.maximum} 项。`,
                noResults: () => '没有匹配结果。',
                searching: () => '正在搜索…',
                removeAllItems: () => '清除全部选项',
                removeItem: () => '移除此项',
            });
        }
        if ($.fn.dataTable) {
            $.extend(true, $.fn.dataTable.defaults, {language: {
                emptyTable: '暂无数据', info: '第 _START_ 至 _END_ 条，共 _TOTAL_ 条',
                infoEmpty: '暂无记录', infoFiltered: '（从 _MAX_ 条记录中筛选）',
                lengthMenu: '每页 _MENU_ 条', loadingRecords: '正在加载…',
                processing: '正在处理…', search: '搜索：', zeroRecords: '没有匹配记录',
                paginate: {first: '首页', last: '末页', next: '下一页', previous: '上一页'},
                aria: {sortAscending: '：升序排列', sortDescending: '：降序排列'},
            }});
        }
        if ($.summernote) $.summernote.options.lang = 'zh-CN';
    })();
</script>
@endif
