<?php
namespace App\Services\CompanyData;

use App\Jobs\ProcessDataAnswer;
use App\Models\User;
use App\Services\CompanyData\Assistant\{AnswerContract, DemoProvider, ExcerptProvider, OpenAiReservedProvider, PlanConnection};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class DataAssistant
{
    public function capabilities(?User $user = null): array
    {
        $connection = $user ? app(PlanConnection::class)->status($user) : null;
        return ['contract' => 'company-data-answer/v1', 'external_requests' => (bool) ($connection['available'] ?? false), 'openai' => (bool) ($connection['available'] ?? false), 'connection' => $connection,
            'demo' => (bool) config('company_data.assistant_demo', true), 'default_mode' => 'excerpt'];
    }

    private function locked(callable $work): mixed
    {
        return DB::transaction(function () use ($work) {
            DB::table('jn_data_state')->where('id', 1)->lockForUpdate()->firstOrFail();
            return $work();
        });
    }
    private function owner(User $user, int $id, bool $writable = false): object
    {
        $user->refresh(); abort_unless(DataSupport::active($user), 403);
        $row = DB::table('jn_data_conversations')->where('id', $id)->where('owner_id', $user->id)->first();
        abort_unless($row, 404, '会话不存在或不可访问。');
        if ($writable) abort_if($row->archived, 409, '会话已归档，请新建会话。');
        return $row;
    }
    public function listing(User $user, array $params): array
    {
        $user->refresh(); abort_unless(DataSupport::active($user), 403);
        $query = DB::table('jn_data_conversations')->where('owner_id', $user->id)->where('archived', (bool) ($params['archived'] ?? false));
        $total = $query->count(); $pages = max(1, (int) ceil($total / 20)); $page = min(max(1, (int) ($params['page'] ?? 1)), $pages);
        return ['items' => $query->orderByDesc('updated_at')->orderByDesc('id')->offset(($page - 1) * 20)->limit(20)->get(['id', 'title', 'archived', 'updated_at'])->all(),
            'page' => $page, 'pages' => $pages, 'total' => $total, 'capabilities' => $this->capabilities($user)];
    }
    public function detail(User $user, int $id): array
    {
        return $this->locked(function () use ($user, $id) {
            $conversation = $this->owner($user, $id); $access = new DataAccess();
            $runs = DB::table('jn_data_answers')->where('conversation_id', $id)->orderBy('id')->get();
            return ['conversation' => $conversation, 'runs' => $runs->map(fn ($r) => $this->present($user, $r, $access))->all(), 'capabilities' => $this->capabilities($user)];
        });
    }
    public function ask(User $user, string $key, array $input): array
    {
        $input = validator($input, ['conversation_id' => 'nullable|integer|min:1', 'question' => 'required|string|max:1000', 'keywords' => 'nullable|string|max:200',
            'category_id' => 'nullable|integer|min:1', 'include_history' => 'required|boolean', 'mode' => 'required|in:excerpt,demo,openai', 'demo_ack' => 'nullable|boolean'])->validate();
        $input['question'] = trim($input['question']); abort_if($input['question'] === '', 422, '请输入问题或要查找的内容。');
        abort_if($input['mode'] === 'openai' && !$this->capabilities($user)['openai'], 409, '个人套餐连接尚未就绪，请检查连接状态或选择原文摘录。');
        abort_if($input['mode'] === 'demo' && (!config('company_data.assistant_demo', true) || empty($input['demo_ack'])), 422, '模拟测试需要明确选择，当前不会调用模型。');
        return (new DataSupport())->mutate($user, $key, 'assistant.ask', $input,
            function () use ($user, $input) { if (!empty($input['conversation_id'])) $this->owner($user, $input['conversation_id'], true); },
            function (DataAccess $access) use ($user, $input) {
                $cat = $input['category_id'] ?? null;
                if ($cat) { $category = $access->category($cat); abort_unless($access->can($user, 'discover', $category), 403); }
                $ownIds = DB::table('jn_data_conversations')->where('owner_id', $user->id)->pluck('id');
                abort_if(DB::table('jn_data_answers')->whereIn('conversation_id', $ownIds)->whereIn('state', ['queued', 'processing'])->count() >= 3, 429, '已有三个问题正在处理，请等待完成。');
                $id = $input['conversation_id'] ?? null;
                if ($id) {
                    abort_if(DB::table('jn_data_answers')->where('conversation_id', $id)->count() >= 50, 422, '此会话已达到五十个问题，请新建会话。');
                    abort_if(DB::table('jn_data_answers')->where('conversation_id', $id)->whereIn('state', ['queued', 'processing'])->exists(), 409, '此会话还有问题正在处理。');
                } else $id = DB::table('jn_data_conversations')->insertGetId(['owner_id' => $user->id, 'title' => mb_substr($input['question'], 0, 80), 'created_at' => now(), 'updated_at' => now()]);
                $run = DB::table('jn_data_answers')->insertGetId(['conversation_id' => $id, 'question' => $input['question'], 'keywords' => trim($input['keywords'] ?? ''),
                    'category_id' => $cat, 'include_history' => $input['include_history'], 'mode' => $input['mode'], 'state' => 'queued', 'created_at' => now(), 'updated_at' => now()]);
                DB::table('jn_data_conversations')->where('id', $id)->update(['updated_at' => now()]);
                (new DataSupport())->event($user, 'assistant', $id, '提交资料查询', ['run_id' => $run, 'mode' => $input['mode']]);
                DB::afterCommit(fn () => $this->dispatch($run));
                return ['id' => $id, 'run_id' => $run];
            });
    }
    public function action(User $user, string $key, int $id, string $action, array $input): array
    {
        return (new DataSupport())->mutate($user, $key, "assistant.$action:$id", $input,
            function () use ($user, $id, $action) {
                if (in_array($action, ['archive', 'restore'])) $this->owner($user, $id);
                else { $run = DB::table('jn_data_answers')->find($id); abort_unless($run, 404); $this->owner($user, $run->conversation_id, true); }
            }, function (DataAccess $access) use ($user, $id, $action, $input) {
                if (in_array($action, ['archive', 'restore'])) {
                    DB::table('jn_data_conversations')->where('id', $id)->update(['archived' => $action === 'archive', 'updated_at' => now()]);
                    if ($action === 'archive') DB::table('jn_data_answers')->where('conversation_id', $id)->whereIn('state', ['queued', 'processing'])->update(['state' => 'cancelled', 'lease' => null, 'finished_at' => now(), 'updated_at' => now()]);
                    (new DataSupport())->event($user, 'assistant', $id, $action === 'archive' ? '归档个人会话' : '恢复个人会话');
                    return ['id' => $id];
                }
                $run = DB::table('jn_data_answers')->find($id);
                if ($action === 'cancel') {
                    abort_unless(in_array($run->state, ['queued', 'processing', 'cancelled']), 409, '该问题已经处理结束。');
                    DB::table('jn_data_answers')->where('id', $id)->update(['state' => 'cancelled', 'lease' => null, 'finished_at' => now(), 'updated_at' => now()]);
                } elseif ($action === 'retry') {
                    abort_if($run->mode === 'openai' && !$this->capabilities($user)['openai'], 409, '个人套餐连接尚未就绪，请先检查连接状态。');
                    abort_unless(in_array($run->state, ['failed', 'cancelled', 'restricted']), 409, '仅失败、取消或来源失效的问题可以重试。');
                    $own = DB::table('jn_data_conversations')->where('owner_id', $user->id)->pluck('id');
                    abort_if(DB::table('jn_data_answers')->whereIn('conversation_id', $own)->whereIn('state', ['queued', 'processing'])->count() >= 3
                        || DB::table('jn_data_answers')->where('conversation_id', $run->conversation_id)->whereIn('state', ['queued', 'processing'])->exists(), 409, '请等待当前问题处理完成。');
                    DB::table('jn_data_answers')->where('id', $id)->update(['state' => 'queued', 'attempts' => 0, 'lease' => null, 'sources' => null, 'answer' => null, 'retrieval' => null, 'error_code' => null,
                        'feedback' => null, 'feedback_note' => null, 'started_at' => null, 'finished_at' => null, 'updated_at' => now()]);
                    DB::afterCommit(fn () => $this->dispatch($id));
                } elseif ($action === 'feedback') {
                    $valid = validator($input, ['feedback' => 'required|in:helpful,incorrect', 'note' => 'nullable|string|max:1000'])->validate();
                    abort_unless($this->present($user, $run, $access)['state'] === 'ready', 409, '当前回答不可评价，请先重新查询。');
                    DB::table('jn_data_answers')->where('id', $id)->update(['feedback' => $valid['feedback'], 'feedback_note' => trim($valid['note'] ?? ''), 'updated_at' => now()]);
                } else abort(404);
                (new DataSupport())->event($user, 'assistant', $run->conversation_id, ['retry' => '重新查询资料', 'cancel' => '取消资料查询', 'feedback' => '提交回答反馈'][$action], ['run_id' => $id]);
                return ['id' => (int) $run->conversation_id, 'run_id' => $id];
            });
    }
    private function terms(object $run): array
    {
        $text = trim($run->keywords ?: $run->question);
        if (!$run->keywords) $text = preg_replace('/需要记录什么|需要注意什么|需要哪些|需要什么|请问|请|帮我|查找|查询|关于|有哪些|是什么|有什么|应该|如何|怎么|要求|说明一下/u', ' ', $text);
        $terms = preg_split('/[\s，。；、？！,;?!：:]+/u', $text, -1, PREG_SPLIT_NO_EMPTY);
        return array_slice(array_values(array_unique(array_filter($terms, fn ($t) => mb_strlen($t) >= 2))), 0, 12);
    }
    private function snapshot(User $user, object $run): array
    {
        $terms = $this->terms($run); $result = (new DataSearch())->retrieve($user, $terms, (bool) $run->include_history, (int) $run->category_id);
        $items = $result['items'];
        $score = function ($source) use ($terms) { $score = 0; foreach ($terms as $term) if (mb_stripos($source['body'], $term) !== false) $score += mb_strlen($term); return $score; };
        usort($items, fn ($a, $b) => $score($b) <=> $score($a));
        $sources = [];
        foreach (array_slice($items, 0, 8) as $i => $source) {
            $positions = []; foreach ($terms as $term) { $pos = mb_stripos($source['body'], $term); if ($pos !== false) $positions[] = $pos; }
            $start = max(0, ($positions ? min($positions) : 0) - 80);
            $source['id'] = 'S' . ($i + 1); $source['body_hash'] = hash('sha256', $source['body']);
            $source['excerpt'] = mb_substr($source['body'], $start, 500);
            $source['body'] = mb_substr($source['body'], max(0, $start - 500), 4000);
            $source['file_hash'] = $source['file_id'] ? DB::table('jn_data_files')->where('id', $source['file_id'])->value('sha256') : null;
            $sources[] = $source;
        }
        return [$sources, ['terms' => $terms, 'limited' => $result['limited'] || count($items) > 8, 'incomplete_files' => $result['incomplete_files']]];
    }
    private function readable(User $user, array $sources, DataAccess $access): bool
    {
        foreach ($sources as $s) {
            $r = DB::table('jn_data_records')->find($s['record_id']); $v = DB::table('jn_data_versions')->find($s['version_id']);
            if (!$r || !$v || $r->archived || !$v->published_at || !$access->canVersion($user, $r, $v)) return false;
            if ($s['file_id']) {
                $file = DB::table('jn_data_files')->find($s['file_id']); $chunk = DB::table('jn_data_chunks')->find($s['chunk_id']);
                if (!$file || !$chunk || (int) $file->record_id !== (int) $r->id || (int) $chunk->file_id !== (int) $file->id
                    || !in_array((int) $file->id, array_map('intval', DataSupport::decode($v->file_ids)), true)
                    || !hash_equals($s['file_hash'], $file->sha256) || !hash_equals($s['body_hash'], hash('sha256', $chunk->body))) return false;
            }
        }
        return true;
    }
    private function present(User $user, object $run, DataAccess $access): array
    {
        $sources = DataSupport::decode($run->sources); $state = $run->state;
        if ($sources && !$this->readable($user, $sources, $access)) $state = 'restricted';
        $visible = in_array($state, ['ready', 'no_sources', 'insufficient_evidence']); $outSources = [];
        if ($visible) foreach ($sources as $s) {
            $current = DB::table('jn_data_records')->where('id', $s['record_id'])->value('published_version_id');
            $s['historical'] = (int) $current !== (int) $s['version_id'];
            unset($s['body'], $s['body_hash'], $s['file_hash'], $s['snippet']); $outSources[] = $s;
        }
        $provider = DataSupport::decode($run->provider_meta);
        if (isset($provider['attempts'])) $provider['attempts'] = array_map(function ($attempt) { unset($attempt['lease']); return $attempt; }, $provider['attempts']);
        return ['id' => (int) $run->id, 'question' => $run->question, 'keywords' => $run->keywords, 'mode' => $run->mode, 'state' => $state,
            'include_history' => (bool) $run->include_history, 'category_id' => $run->category_id, 'created_at' => $run->created_at,
            'answer' => $visible ? DataSupport::decode($run->answer) : null, 'sources' => $outSources, 'retrieval' => $visible ? DataSupport::decode($run->retrieval) : null,
            'feedback' => $visible ? $run->feedback : null, 'feedback_note' => $visible ? $run->feedback_note : null,
            'provider' => $provider,
            'error' => $state === 'failed' ? PlanConnection::message($run->error_code ?? '') : null];
    }
    private function dispatch(int $id): void { try { ProcessDataAnswer::dispatch($id); } catch (\Throwable) { /* Durable queued row is recovered by the scheduler. */ } }

    public function process(int $id): void
    {
        $claimed = $this->locked(function () use ($id) {
            $run = DB::table('jn_data_answers')->find($id); if (!$run || $run->state !== 'queued' || $run->mode === 'openai') return null;
            $c = DB::table('jn_data_conversations')->find($run->conversation_id); $user = $c ? User::find($c->owner_id) : null;
            if (!$user || !DataSupport::active($user) || $c->archived) { DB::table('jn_data_answers')->where('id', $id)->update(['state' => 'cancelled', 'finished_at' => now(), 'updated_at' => now()]); return null; }
            $lease = (string) Str::uuid();
            DB::table('jn_data_answers')->where('id', $id)->update(['state' => 'processing', 'lease' => $lease, 'attempts' => $run->attempts + 1, 'started_at' => now(), 'updated_at' => now()]);
            return [$run, $user, $lease];
        });
        if (!$claimed) return;
        [$run, $user, $lease] = $claimed;
        try {
            $prepared = $this->locked(function () use ($run, $user, $lease) {
                $current = DB::table('jn_data_answers')->find($run->id);
                if ($current->state !== 'processing' || $current->lease !== $lease) return null;
                $user->refresh(); if (!DataSupport::active($user)) return null;
                [$sources, $retrieval] = $this->snapshot($user, $run);
                DB::table('jn_data_answers')->where('id', $run->id)->update(['sources' => DataSupport::json($sources), 'retrieval' => DataSupport::json($retrieval)]);
                return [$sources, $retrieval];
            });
            if (!$prepared) { $this->finish($id, $lease, 'cancelled'); return; }
            [$sources] = $prepared;
            $answer = [];
            if ($sources) {
                // No previous replies, SQL, file paths, credentials or executable tools cross this boundary.
                $provider = match ($run->mode) { 'excerpt' => app(ExcerptProvider::class), 'demo' => app(DemoProvider::class), default => app(OpenAiReservedProvider::class) };
                $request = ['contract' => 'company-data-answer/v1', 'question' => $run->question, 'sources' => array_map(fn ($s) => array_intersect_key($s, array_flip(['id', 'title', 'version', 'location', 'body', 'excerpt'])), $sources)];
                $answer = AnswerContract::validate($provider->answer($request), $sources);
            }
            $this->locked(function () use ($id, $lease, $user, $sources, $answer) {
                $user->refresh();
                $valid = DataSupport::active($user) && $this->readable($user, $sources, new DataAccess());
                $this->finish($id, $lease, !$valid ? 'restricted' : ($sources ? 'ready' : 'no_sources'), $valid ? $answer : []);
            });
        } catch (\Throwable $error) {
            $this->finish($id, $lease, 'failed', [], $error instanceof \UnexpectedValueException ? 'INVALID_RESPONSE' : 'PROCESSING_FAILED');
        }
    }
    private function finish(int $id, string $lease, string $state, array $answer = [], ?string $code = null): void
    {
        DB::table('jn_data_answers')->where('id', $id)->where('state', 'processing')->where('lease', $lease)->update(['state' => $state, 'answer' => DataSupport::json($answer),
            'error_code' => $code, 'lease' => null, 'finished_at' => now(), 'updated_at' => now()]);
    }
    public function recover(): int
    {
        return $this->locked(function () {
            $rows = DB::table('jn_data_answers')->whereIn('state', ['queued', 'processing'])->where('updated_at', '<', now()->subMinutes(3))->limit(100)->get();
            foreach ($rows as $row) {
                // A model call may already have consumed usage; never replay it automatically.
                $failed = $row->mode === 'openai' || $row->attempts >= 3;
                DB::table('jn_data_answers')->where('id', $row->id)->update(['state' => $failed ? 'failed' : 'queued', 'lease' => null, 'updated_at' => now(), 'error_code' => $failed ? 'INTERRUPTED' : null]);
                if (!$failed) DB::afterCommit(fn () => $this->dispatch($row->id));
            }
            return $rows->count();
        });
    }

    public function claimPlan(int $owner): ?array
    {
        return $this->locked(function () use ($owner) {
            $user = User::find($owner);
            if (!$user || !DataSupport::active($user) || !$this->capabilities($user)['openai']) return null;
            $ids = DB::table('jn_data_conversations')->where('owner_id', $owner)->where('archived', false)->pluck('id');
            if (DB::table('jn_data_answers')->whereIn('conversation_id', $ids)->where('mode', 'openai')->where('state', 'processing')->exists()) return null;
            $run = DB::table('jn_data_answers')->whereIn('conversation_id', $ids)->where('mode', 'openai')->where('state', 'queued')->orderBy('id')->first();
            if (!$run) return null;
            [$sources, $retrieval] = $this->snapshot($user, $run);
            $lease = (string) Str::uuid();
            $meta = DataSupport::decode($run->provider_meta); $attempts = $meta['attempts'] ?? [];
            if ($sources) $attempts[] = ['lease' => $lease, 'model' => $this->capabilities($user)['connection']['model'], 'usage' => [], 'at' => now()->toIso8601String(), 'reported' => false];
            $meta = ['route' => 'chatgpt-plan', 'model' => $this->capabilities($user)['connection']['model'], 'attempts' => $attempts];
            DB::table('jn_data_answers')->where('id', $run->id)->update(['sources' => DataSupport::json($sources), 'retrieval' => DataSupport::json($retrieval),
                'provider_meta' => DataSupport::json($meta), 'state' => 'processing', 'lease' => $lease, 'attempts' => $run->attempts + 1, 'started_at' => now(), 'updated_at' => now()]);
            if (!$sources) { $this->finish($run->id, $lease, 'no_sources'); return null; }
            return ['id' => $run->id, 'lease' => $lease, 'request' => ['contract' => 'company-data-answer/v1', 'question' => $run->question,
                'sources' => array_map(fn ($s) => array_intersect_key($s, array_flip(['id', 'title', 'version', 'location', 'body', 'excerpt'])), $sources)]];
        });
    }
    private function planRun(int $owner, array $input): ?object
    {
        $run = DB::table('jn_data_answers')->where('id', $input['id'])->where('mode', 'openai')->where('state', 'processing')->where('lease', $input['lease'])
            ->whereIn('conversation_id', DB::table('jn_data_conversations')->where('owner_id', $owner)->where('archived', false)->select('id'))->first();
        if (!$run) return null;
        $user = User::find($owner);
        if (!$user || !DataSupport::active($user) || !$this->readable($user, DataSupport::decode($run->sources), new DataAccess())) {
            $this->finish($run->id, $run->lease, 'restricted'); return null;
        }
        if (!$this->capabilities($user)['openai']) { $this->finish($run->id, $run->lease, 'cancelled'); return null; }
        if (now()->diffInSeconds($run->started_at, true) > 150) { $this->finish($run->id, $run->lease, 'failed', [], 'request_timeout'); return null; }
        return $run;
    }
    public function progressPlan(int $owner, array $input): array
    {
        validator($input, ['id' => 'required|integer', 'lease' => 'required|uuid'])->validate();
        return $this->locked(function () use ($owner, $input) {
            $run = $this->planRun($owner, $input);
            if ($run) DB::table('jn_data_answers')->where('id', $run->id)->update(['updated_at' => now()]);
            return ['active' => (bool) $run];
        });
    }
    public function completePlan(int $owner, array $input): array
    {
        $input = validator($input, ['id' => 'required|integer', 'lease' => 'required|uuid', 'answer' => 'nullable|array',
            'error' => ['nullable', 'regex:/^[a-z0-9_]{1,80}$/D'], 'model' => ['required', 'regex:/^[a-zA-Z0-9._-]{1,100}$/D'],
            'usage' => 'nullable|array:input_tokens,output_tokens,total_tokens', 'usage.*' => 'integer|min:0|max:10000000'])->validate();
        return $this->locked(function () use ($owner, $input) {
            // Store usage even for a cancelled/late result, but never restore its text.
            $row = DB::table('jn_data_answers')->where('id', $input['id'])->where('mode', 'openai')
                ->whereIn('conversation_id', DB::table('jn_data_conversations')->where('owner_id', $owner)->select('id'))->first();
            abort_unless($row, 404);
            $meta = DataSupport::decode($row->provider_meta); $attempts = $meta['attempts'] ?? [];
            $index = array_search($input['lease'], array_column($attempts, 'lease'), true);
            abort_if($index === false, 409);
            if (empty($attempts[$index]['reported'])) {
                $attempts[$index] = [...$attempts[$index], 'model' => $input['model'], 'usage' => $input['usage'] ?? [], 'reported' => true];
                $meta['attempts'] = $attempts;
                DB::table('jn_data_answers')->where('id', $row->id)->update(['provider_meta' => DataSupport::json($meta)]);
            }
            $run = $this->planRun($owner, $input);
            if (!$run) return ['accepted' => false];
            $error = $input['error'] ?? null; $answer = [];
            if (!$error) try { $answer = AnswerContract::validate($input['answer'] ?? [], DataSupport::decode($run->sources)); }
                catch (\UnexpectedValueException) { $error = 'INVALID_RESPONSE'; }
            $state = $error ? 'failed' : (!empty($answer['abstained']) ? 'insufficient_evidence' : 'ready');
            $this->finish($run->id, $run->lease, $state, $answer, $error);
            return ['accepted' => true];
        });
    }
}
