# 第三方组件与来源

Frappe Framework 及 frappe_docker 使用 MIT 许可证。本项目使用官方基础镜像，并参照官方分层 Containerfile 与 Compose 的服务结构；自定义源码位于独立应用内。

- Frappe: https://github.com/frappe/frappe/tree/v16.51.0
- frappe_docker: https://github.com/frappe/frappe_docker/tree/ca1826c21f7fa5c5b0ace69fd2ab297585154a52
- MariaDB official image: https://hub.docker.com/_/mariadb
- Redis official image: https://hub.docker.com/_/redis

镜像中各组件保留各自许可证；本说明不把全部依赖概括成一个许可证，也不自动为本项目自有代码授予开源许可。

MIT 上游版权与许可原文保存于 `infra/upstream-frappe-docker-LICENSE`。
