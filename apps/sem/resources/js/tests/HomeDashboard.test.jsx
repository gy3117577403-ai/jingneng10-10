import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import HomeDashboard from '../components/HomeDashboard';
vi.mock('../components/dashboard/DashboardGrid.jsx', () => ({ default: () => <div>原分析看板</div> }));
vi.mock('../components/TodayView.jsx', () => ({ default: () => <div>今日待办</div> }));
const urls = { presales:'/presales', quotes_index:'/quotes', quotes_show:'/quotes/', orders_index:'/orders', orders_show:'/orders/' };
beforeEach(() => { history.replaceState({}, '', '/dashboard?view=overview'); });
afterEach(() => { vi.unstubAllGlobals(); document.querySelector('meta[name="user-permissions"]')?.remove(); });
describe('work overview', () => {
    it('links accessible inquiries to their actual review and hides ungranted business menus', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok:true,json:async()=>({total:1,items:[{id:'sample-a',title:'测试询价',kind:'sheet',document_count:2,review_count:1}]})}));
        render(<HomeDashboard urls={urls} recentQuotes={[{id:5,label:'不可见报价'}]} />);
        expect(await screen.findByText('测试询价')).toBeVisible();
        expect(screen.getByText('测试询价').closest('a')).toHaveAttribute('href','/presales/inquiries/sample-a?tab=ai');
        expect(screen.queryByText('不可见报价')).toBeNull();
        expect(screen.queryByText('报价管理')).toBeNull();
        fireEvent.click(screen.getByRole('tab',{name:'分析看板'}));
        expect(screen.getByText('原分析看板')).toBeVisible();
    });
    it('shows recoverable load errors and accepts an empty result on retry', async () => {
        const fetch = vi.fn().mockResolvedValueOnce({ok:false}).mockResolvedValueOnce({ok:true,json:async()=>({total:0,items:[]})});
        vi.stubGlobal('fetch', fetch); render(<HomeDashboard urls={urls} />);
        expect(await screen.findByRole('alert')).toHaveTextContent('无法读取询价');
        fireEvent.click(screen.getByRole('button',{name:'重试'}));
        expect(await screen.findByText('新建询价 →')).toBeVisible(); expect(fetch).toHaveBeenCalledTimes(2);
    });
});
