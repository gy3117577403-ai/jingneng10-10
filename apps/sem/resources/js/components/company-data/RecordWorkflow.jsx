import React from 'react';
import {CircleCheck, Clock3, Info} from 'lucide-react';

export function submissionBlockers(detail, userId) {
    if (!detail?.readable) return [];
    const blockers = [];
    if (detail.schema_current === false) blockers.push('字段配置已变化，请先修订并保存新版本');
    if (detail.record.kind === 'file' && !detail.files.length) blockers.push('文件资料需要先上传至少一份附件');
    if (!detail.reviewers.some(user => Number(user.id) !== Number(userId))) blockers.push('暂无另一位有审核权限的人员，请联系资料管理员配置');
    return blockers;
}

export default function RecordWorkflow({detail, current, userId, blockers}) {
    if (!detail?.readable || !current || detail.record.archived) return null;
    const {record, version, abilities} = detail;
    if (version.state === 'pending') return <div className="dc-workflow-note" role="status"><Clock3 size={17}/><div><strong>{Number(version.reviewer_id) === Number(userId) && abilities.review ? '待你审核此版本' : '等待指定审核人处理'}</strong><p>审核期间内容已锁定。{record.published_version_id ? '原发布版继续供其他人员查阅。' : '通过并发布后，有权限的人员即可查阅。'}</p></div></div>;
    if (record.draft_version_id) return <div className="dc-workflow-note" id="dc-submit-guidance"><Info size={17}/><div><strong>{version.state === 'rejected' ? '按退回意见修订后，重新提交审核' : version.state === 'withdrawn' ? '审核已撤回，可继续修订' : '草稿已保存，下一步提交审核'}</strong>
        {abilities.submit ? <>{blockers.length ? <ul>{blockers.map(message => <li key={message}>{message}</li>)}</ul> : <p>内容核对完成后，点击“提交审核”并指定另一位审核人。</p>}</> : <p>你当前没有提交权限，由有提交权限的维护人员继续处理。</p>}
        {record.published_version_id && <p>当前修改尚未发布，原发布版继续有效。</p>}
    </div></div>;
    return <div className="dc-workflow-note is-published"><CircleCheck size={17}/><div><strong>当前发布版 · 第 {version.number} 版</strong><p>{abilities.edit ? '需要更新时选择“修订资料”。修订会保存为新草稿，审核通过后再替换发布版。' : '可按当前权限阅读此版本。'}</p></div></div>;
}
