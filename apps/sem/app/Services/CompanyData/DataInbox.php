<?php
namespace App\Services\CompanyData;
use App\Models\User;
class DataInbox
{
    public function items(User $user, string $scope, string $search): array
    {
        $items = []; $labels = ['review' => '资料审核', 'access' => '查看申请', 'task' => '资料协作'];
        foreach (app(DataCollaboration::class)->items($user) as $i) {
            if (!in_array($i['state'], ['pending', 'open', 'accepted', 'blocked'], true)) continue;
            if ($scope === 'mine' && (int) $i['assignee_id'] !== (int) $user->id) continue;
            if ($scope === 'requested' && (int) $i['actor_id'] !== (int) $user->id) continue;
            if ($search !== '' && !str_contains(mb_strtolower($i['title'] . $i['record_title']), mb_strtolower($search))) continue;
            $key = 'data_' . $i['type'];
            $items[] = ['key' => "$key:" . $i['id'], 'source' => $key, 'source_label' => $labels[$i['type']], 'title' => $i['record_title'], 'code' => $i['title'], 'company' => '公司资料',
                'owner' => User::find($i['assignee_id'])?->name ?? '已停用人员', 'date' => $i['due_date'] ?? $i['created_at'], 'state' => ['pending' => '待处理', 'open' => '待接收', 'accepted' => '处理中', 'blocked' => '待补充'][$i['state']],
                'tone' => 'warning', 'reason' => '处理结论与指定资料版本关联，打开资料中心核对。', 'action' => '处理' . $labels[$i['type']],
                'url' => route('company-data.page') . '?tab=collaboration&record=' . $i['record_id'] . '&version=' . $i['version_id']];
        }
        $sources = []; foreach ($labels as $type => $label) $sources[] = ['key' => 'data_' . $type, 'label' => $label, 'total' => count(array_filter($items, fn ($i) => $i['source'] === 'data_' . $type))];
        return ['items' => $items, 'sources' => $sources];
    }
}
