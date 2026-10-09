"""AI boundary. F0 makes no model requests and cannot claim AI task success."""


class AIUnavailable(RuntimeError):
    pass


def get_mode():
    return 'disabled'


def generate(*args, **kwargs):
    raise AIUnavailable('AI provider is not configured. Model integration belongs to F2.')
