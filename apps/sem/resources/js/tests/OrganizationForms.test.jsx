import React, {useState} from 'react';
import {render, screen, waitFor, cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, afterEach, describe, it, expect, vi} from 'vitest';
import {Field, FormDialog, PersonFields} from '../components/organization/Forms';
import {SearchSelect} from '../ui/shadcn/controls';

beforeEach(() => {
    window.matchMedia = vi.fn(() => ({matches:false, addEventListener:vi.fn(), removeEventListener:vi.fn()}));
    global.ResizeObserver = class {observe(){} unobserve(){} disconnect(){}};
    Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {cleanup(); vi.restoreAllMocks();});

describe('organization form selection', () => {
    it('filters a long catalog and commits only the keyboard-selected value', async () => {
        const user = userEvent.setup(), changed = vi.fn();
        function Example() {
            const [value,setValue] = useState('0');
            return <Field label="岗位"><SearchSelect label="岗位" value={value}
                onValueChange={next => {setValue(next); changed(next);}}
                items={Array.from({length:12},(_,i) => ({value:String(i),label:`示例岗位${i}`}))}/></Field>;
        }
        render(<Example/>);
        await user.click(screen.getByRole('combobox',{name:'岗位',exact:true}));
        const input = await screen.findByRole('combobox',{name:'搜索岗位'});
        await user.type(input,'岗位11');
        expect(await screen.findByRole('option',{name:'示例岗位11'})).toBeVisible();
        expect(screen.getAllByRole('option')).toHaveLength(1);
        expect(changed).not.toHaveBeenCalled();
        await user.keyboard('{ArrowDown}{Enter}');
        await waitFor(() => expect(changed).toHaveBeenCalledWith('11'));
        expect(screen.getByRole('combobox',{name:'岗位',exact:true})).toHaveTextContent('示例岗位11');
    });

    it('keeps a required organization empty until explicitly selected and blocks submission', async () => {
        const user = userEvent.setup(), save = vi.fn();
        const data = {units:Array.from({length:10},(_,i) => ({id:i+1,name:`示例部门${i+1}`,status:'active',can_people:true})), positions:[]};
        render(<FormDialog title="新增成员" initial={{name:'虚构成员',status:'active',needs_review:true,assignments:[{unit_id:null,position_id:null,title:'',primary:true}]}} onClose={() => {}} onSave={save}>
            {(v,set) => <PersonFields v={v} set={set} data={data}/>}
        </FormDialog>);
        await user.click(screen.getByRole('button',{name:'保存',exact:true}));
        expect(save).not.toHaveBeenCalled();
        await user.click(screen.getByRole('combobox',{name:'任职1组织',exact:true}));
        await user.type(await screen.findByRole('combobox',{name:'搜索任职1组织'}),'部门10');
        await user.click(await screen.findByRole('option',{name:'示例部门10'}));
        await user.click(screen.getByRole('button',{name:'保存',exact:true}));
        await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({assignments:[expect.objectContaining({unit_id:10})]})));
    });
});
