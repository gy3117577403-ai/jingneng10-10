import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StackedBar } from '../components/QualityIndex';
describe('quality empty state', () => {
    it('shows no data instead of inventing an external rate', () => {
        const {rerender} = render(<StackedBar label="质量措施" internal={0} external={0} trans={{}} />);
        expect(screen.getByText('暂无数据')).toBeVisible(); expect(screen.queryByText('100%')).toBeNull();
        rerender(<StackedBar label="质量措施" internal={25} external={75} trans={{}} />);
        expect(screen.getByText('25%')).toBeVisible(); expect(screen.getByText('75%')).toBeVisible(); expect(screen.queryByText('暂无数据')).toBeNull();
    });
});
