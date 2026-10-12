export const byId=(rows,id)=>rows.find(x=>Number(x.id)===Number(id));
export function ancestors(units,id){const result=[],seen=new Set();let row=byId(units,id);while(row&&!seen.has(row.id)){seen.add(row.id);result.unshift(row);row=byId(units,row.parent_id);}return result;}
export const within=(units,id,root)=>!root||ancestors(units,id).some(x=>Number(x.id)===Number(root));
export const assignment=(p)=>p.assignments.find(a=>a.primary)||p.assignments[0];
export const positionName=(p,positions)=>p?.title||byId(positions,p?.position_id)?.name||'岗位待补充';
export const unitPath=(units,id)=>ancestors(units,id).map(x=>x.name).join(' / ');
export function chartLayout(units,people,selected,expanded,showPeople,compact=false){
    const path=ancestors(units,selected),root=path[Math.max(0,path.length-(compact===2?1:compact?2:3))]||units.find(u=>!u.parent_id)||units[0];
    if(!root)return {nodes:[],edges:[]};
    const pathIds=new Set(path.map(x=>x.id)),nodes=[],edges=[];
    function branch(u,depth){
        const children=units.filter(x=>Number(x.parent_id)===Number(u.id)).sort((a,b)=>a.sort-b.sort||a.id-b.id);
        const open=!expanded.has(-u.id)&&(expanded.has(u.id)||pathIds.has(u.id)||depth===0);
        const allMembers=showPeople&&open?people.filter(p=>p.assignments.some(a=>Number(a.unit_id)===Number(u.id))):[];
        const members=allMembers.slice(0,6),moreCount=allMembers.length>6?allMembers.length:0;
        return {u,depth,children:open?children.map(x=>branch(x,depth+1)):[],members,moreCount,hasChildren:children.length>0};
    }
    function measure(b){b.height=Math.max(78,b.children.reduce((sum,c)=>sum+measure(c)+20,0)+(b.members.length?b.members.length*74+8:0)+(b.moreCount?52:0)-20);return b.height;}
    function place(b,y){const id='u'+b.u.id,cy=y+b.height/2-33;nodes.push({id,type:'unit',position:{x:b.depth*236,y:cy},data:{unit:b.u,hasChildren:b.hasChildren,open:!expanded.has(-b.u.id)&&(expanded.has(b.u.id)||pathIds.has(b.u.id)||b.depth===0),selected:Number(b.u.id)===Number(selected)}});let next=y;
        for(const c of b.children){place(c,next);edges.push({id:id+'-u'+c.u.id,source:id,target:'u'+c.u.id,type:'smoothstep',className:pathIds.has(c.u.id)?'org-edge-selected':''});next+=c.height+20;}
        for(const p of b.members){const target='p'+p.id+'u'+b.u.id;nodes.push({id:target,type:'person',position:{x:(b.depth+1)*236,y:next},data:{person:p,unit:b.u}});edges.push({id:id+'-'+target,source:id,target,type:'smoothstep'});next+=74;}
        if(b.moreCount){const target='more'+b.u.id;nodes.push({id:target,type:'more',position:{x:(b.depth+1)*236,y:next},data:{unit:b.u,count:b.moreCount}});edges.push({id:id+'-'+target,source:id,target,type:'smoothstep'});}
    }
    const tree=branch(root,0);measure(tree);place(tree,0);return {nodes,edges};
}
