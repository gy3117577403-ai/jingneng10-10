import React from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import CompanyData, {CategoryTree} from '../components/company-data/CompanyData';
import RecordDetail from '../components/company-data/RecordDetail';
import {confirmAction} from '../ui/confirmAction';

vi.mock('../ui/confirmAction', () => ({confirmAction: vi.fn().mockResolvedValue(false)}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); history.replaceState(null, '', '/'); });

const categories = [{id: 1, parent_id: null, name: '虚构演示', abilities: {}}, {id: 2, parent_id: 1, name: '设备资料', abilities: {view: true, create: true}, fields: []}];
const record = {id: 10, category_id: 2, readable: true, kind: 'file', title: '虚构点检制度', code: 'DEMO-READ', version: 2, state: 'published', updated_at: '2026-10-11 10:00:00'};
const listing = {categories, items: [record], total: 1, page: 1, pages: 1, manager: false, user_id: 7};
const detail = {
    record: {...record, revision: 1, category: '设备资料', published_version_id: 20, draft_version_id: null, archived: false},
    version: {id: 20, number: 2, title: record.title, state: 'published', fields: [{key: 'owner', label: '责任岗位'}], values: {owner: '演示设备岗'}, file_ids: [30]},
    versions: [{id: 20, number: 2, title: record.title, state: 'published'}, {id: 19, number: 1, title: '旧版虚构制度', state: 'published'}],
    files: [{id: 30, filename: '虚构点检.txt', size: 80, reading: {state: 'ready', label: '正文可检索'}}],
    abilities: {view: true, collaborate: true}, readable: true, permissions: [{action: 'view', label: '查看', allowed: true, reason: '分类授权'}], comments: [], events: [], collaborators: [], reviewers: [], approvers: []
};
const textPreview = {type: 'text', text: '虚构原文：核对版本后再执行。', start: 1, total: 1};
const response = data => ({ok: true, headers: {get: () => 'application/json'}, json: async () => data});
function stubPreview() { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(textPreview))); }

describe('continuous document workspace', () => {
    it('reads the exact cited page inline without nesting a modal and respects download permissions', async () => {
        stubPreview(); const api = {base: '/data/api', get: vi.fn().mockResolvedValue(detail), post: vi.fn()};
        render(<RecordDetail api={api} selection={{id: 10, version: 20, file: 30, page: 7, row: 1}} userId={7} manager={false} sourceMode onClose={() => {}} onChanged={() => {}}/>);
        expect(await screen.findByText(textPreview.text)).toBeVisible();
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/versions/20/files/30?page=7&row=1'), expect.anything());
        expect(screen.queryByRole('link', {name: /下载/})).toBeNull();
        expect(screen.queryByRole('button', {name: '修订资料'})).toBeNull();
    });
    it('keeps the source visible while opening collaboration and protects an unsent comment from version changes', async () => {
        stubPreview(); const api = {base: '/data/api', get: vi.fn().mockResolvedValue(detail), post: vi.fn()}; const close = vi.fn();
        render(<RecordDetail api={api} selection={{id: 10}} userId={7} onClose={close} onChanged={() => {}}/>);
        await screen.findByText(textPreview.text);
        fireEvent.click(screen.getByRole('tab', {name: '协作', exact: true}));
        fireEvent.change(screen.getByLabelText('添加评论'), {target: {value: '待确认的虚构意见'}});
        expect(screen.getByText(textPreview.text)).toBeVisible();
        fireEvent.change(screen.getByLabelText('查看版本'), {target: {value: '19'}});
        await waitFor(() => expect(confirmAction).toHaveBeenCalled());
        expect(api.get.mock.calls.some(([path]) => path.includes('version=19'))).toBe(false);
        expect(screen.getByLabelText('添加评论')).toHaveValue('待确认的虚构意见');
        fireEvent.click(screen.getByRole('button', {name: '返回资料库'}));
        await waitFor(() => expect(confirmAction).toHaveBeenCalledTimes(2)); expect(close).not.toHaveBeenCalled();
    });
    it('clears readable content after permissions change during a refresh', async () => {
        stubPreview(); const api = {base: '/data/api', get: vi.fn().mockResolvedValueOnce(detail).mockRejectedValue(new Error('权限已变化')), post: vi.fn()};
        render(<RecordDetail api={api} selection={{id: 10}} userId={7} onClose={() => {}} onChanged={() => {}}/>);
        await screen.findByText(textPreview.text); fireEvent(window, new Event('focus'));
        expect(await screen.findByRole('alert')).toHaveTextContent('权限已变化');
        expect(screen.queryByText(textPreview.text)).toBeNull(); expect(screen.getByRole('button', {name: '重新读取'})).toBeVisible();
    });
    it('resets the cited location when the reader explicitly chooses another version', async () => {
        stubPreview(); const old = {...detail, version: {...detail.version, id: 19, number: 1}};
        const api = {base: '/data/api', get: vi.fn(path => Promise.resolve(path.includes('version=19') ? old : detail)), post: vi.fn()};
        render(<RecordDetail api={api} selection={{id: 10, version: 20, file: 30, page: 7, row: 11}} userId={7} sourceMode onClose={() => {}} onChanged={() => {}}/>);
        await screen.findByText(textPreview.text);
        fireEvent.change(screen.getByLabelText('查看版本'), {target: {value: '19'}});
        await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/versions/19/files/30?page=1&row=1'), expect.anything()));
        expect(fetch.mock.calls.some(([url]) => String(url).includes('/versions/19/files/30?page=7'))).toBe(false);
    });
    it('does not expose the document when the record is discoverable but not readable', async () => {
        stubPreview(); const api = {base: '/data/api', get: vi.fn().mockResolvedValue({...detail, readable: false, files: [], abilities: {request: true}}), post: vi.fn()};
        render(<RecordDetail api={api} selection={{id: 10}} userId={7} onClose={() => {}} onChanged={() => {}}/>);
        expect(await screen.findByText('内容需要授权查看')).toBeVisible();
        expect(fetch).not.toHaveBeenCalled(); expect(screen.queryByLabelText('文件预览')).toBeNull();
    });
});

describe('library navigation and continuity', () => {
    it('finds a nested category even when its parent does not match, and supports expanding branches', () => {
        const choose = vi.fn(); render(<CategoryTree categories={categories} value="" onChange={choose}/>);
        fireEvent.click(screen.getByRole('button', {name: '收起虚构演示'}));
        expect(screen.queryByRole('button', {name: '设备资料'})).toBeNull();
        fireEvent.change(screen.getByLabelText('查找资料分类'), {target: {value: '设备'}});
        fireEvent.click(screen.getByRole('button', {name: '设备资料'})); expect(choose).toHaveBeenCalledWith('2');
    });
    it('preserves list filtering and scroll position when the inline reader closes', async () => {
        vi.stubGlobal('fetch', vi.fn(url => Promise.resolve(response(String(url).includes('/files/') ? textPreview : String(url).includes('/records/10') ? detail : listing))));
        render(<CompanyData endpoint="/data/api"/>);
        const open = await screen.findByRole('button', {name: /虚构点检制度/});
        fireEvent.change(screen.getByLabelText('搜索资料'), {target: {value: '点检'}});
        const table = document.querySelector('.dc-table-wrap'); table.scrollTop = 120;
        fireEvent.click(open); expect(await screen.findByText(textPreview.text)).toBeVisible();
        expect(screen.getByLabelText('搜索资料')).not.toBeVisible();
        fireEvent.click(screen.getByRole('button', {name: '返回资料库'}));
        await waitFor(() => expect(screen.getByLabelText('搜索资料')).toBeVisible());
        expect(screen.getByLabelText('搜索资料')).toHaveValue('点检'); expect(table.scrollTop).toBe(120);
        expect(new URLSearchParams(location.search).has('record')).toBe(false);
    });
    it('keeps assistant drafts when switching workspace tabs and keeps administration role scoped', async () => {
        vi.stubGlobal('fetch', vi.fn(url => Promise.resolve(response(String(url).includes('/assistant') ? {items: [], page: 1, pages: 1, capabilities: {demo: true}} : listing))));
        render(<CompanyData endpoint="/data/api"/>); await screen.findByRole('button', {name: /虚构点检制度/});
        fireEvent.click(screen.getByRole('tab', {name: '资料助手'}));
        fireEvent.change(await screen.findByLabelText('问题或关键词'), {target: {value: '待核对的虚构问题'}});
        fireEvent.click(screen.getByRole('tab', {name: '资料库'}));
        fireEvent.click(screen.getByRole('tab', {name: '资料助手'}));
        expect(screen.getByLabelText('问题或关键词')).toHaveValue('待核对的虚构问题');
        expect(screen.queryByRole('button', {name: '分类与权限'})).toBeNull();
    });
});
