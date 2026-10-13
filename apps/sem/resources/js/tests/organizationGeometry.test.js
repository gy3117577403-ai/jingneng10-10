import {describe,it,expect} from 'vitest';
import {arrangeTree,branchGeometry,branchPaths,interpolateChart,frameChart,revealNode,NODE_WIDTH,ROW_GAP} from '../components/organization/chartGeometry';

const node=(id,children=[],height=80)=>({id,type:'unit',height,data:{active:id==='project'},children});
const full=()=>arrangeTree(node('root',[node('workshop',[node('sheet',[node('a',[],60),node('b',[],60)]),node('project',[node('c',[],60)])]),node('warehouse')]));
describe('organization geometry contract',()=>{
    it('keeps sibling columns separated and uses one connector trunk per parent',()=>{
        const chart=full();
        const columns=Map.groupBy(chart.nodes,n=>n.position.x);
        for(const nodes of columns.values()){
            nodes.sort((a,b)=>a.position.y-b.position.y);
            for(let i=1;i<nodes.length;i++) expect(nodes[i].position.y-nodes[i-1].position.y-nodes[i-1].height).toBeGreaterThanOrEqual(ROW_GAP);
        }
        expect(new Set(chart.branches.map(b=>b.source)).size).toBe(chart.branches.length);
        for(const branch of chart.branches){
            const b=branchGeometry(branch,chart.nodes),s=chart.nodes.find(n=>n.id===branch.source);
            expect(b.start).toEqual({x:s.position.x+NODE_WIDTH,y:s.position.y+s.height/2});
            expect(branchPaths(b).arms).toHaveLength(branch.targets.length);
            for(const arm of b.targets){const n=chart.nodes.find(n=>n.id===arm.id);expect(arm.y).toBe(n.position.y+n.height/2);expect(arm.x).toBe(n.position.x);}
        }
    });
    it('keeps every arm attached during interrupted expansion and collapse',()=>{
        const open=full(),closed=arrangeTree(node('root',[node('workshop'),node('warehouse')]));
        let last=open;
        for(const target of [closed,open,closed]){
            for(const progress of [.15,.5,.85]){
                const frame=interpolateChart(last,target,progress);
                for(const branch of frame.branches){const b=branchGeometry(branch,frame.nodes);if(!b)continue;
                    for(const arm of b.targets){const n=frame.nodes.find(n=>n.id===arm.id);expect(arm.y).toBeCloseTo(n.position.y+n.height/2);expect(arm.x).toBeCloseTo(n.position.x);}
                }
                last=frame;
            }
        }
        expect(interpolateChart(last,closed,1)).toBe(closed);
    });
    it('retains readable automatic zoom and reveals the selected node beside an inspector',()=>{
        const chart=full(),area={width:640,height:580};
        const initial=frameChart(chart.nodes,area,'project',1);
        expect(initial.zoom).toBe(1);
        const localFrame = frameChart(chart.nodes,{width:840,height:600},'project',1,chart.branches);
        for (const id of ['workshop','project','c']) {
            const n = chart.nodes.find(n => n.id === id);
            expect(n.position.x + localFrame.x).toBeGreaterThanOrEqual(28);
            expect(n.position.x + NODE_WIDTH + localFrame.x).toBeLessThanOrEqual(812);
        }
        // A distant ancestor remains reachable by pan without showing a clipped
        // strip of its card at the edge of the initially framed columns.
        expect(chart.nodes.find(n => n.id === 'root').position.x + NODE_WIDTH + localFrame.x).toBeLessThanOrEqual(0);
        const target=chart.nodes.find(n=>n.id==='project'),after=revealNode(target,area,{x:0,y:0,zoom:1});
        expect(after.zoom).toBe(1);
        expect(target.position.x+NODE_WIDTH+after.x).toBeLessThanOrEqual(area.width-28);
        expect(target.position.y+target.height+after.y).toBeLessThanOrEqual(area.height-64);
        const fit=frameChart(chart.nodes,{width:1100,height:700},'project');
        for(const n of chart.nodes){expect(n.position.x*fit.zoom+fit.x).toBeGreaterThanOrEqual(27);expect((n.position.x+NODE_WIDTH)*fit.zoom+fit.x).toBeLessThanOrEqual(1073);}
    });
});
