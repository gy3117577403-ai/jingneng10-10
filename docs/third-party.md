# 第三方组件与来源

Frappe Framework 及 frappe_docker 使用 MIT 许可证。本项目使用官方基础镜像，并参照官方分层 Containerfile 与 Compose 的服务结构；自定义源码位于独立应用内。

- Frappe: https://github.com/frappe/frappe/tree/v16.51.0
- frappe_docker: https://github.com/frappe/frappe_docker/tree/ca1826c21f7fa5c5b0ace69fd2ab297585154a52
- MariaDB official image: https://hub.docker.com/_/mariadb
- Redis official image: https://hub.docker.com/_/redis
- Vue 3.5.43、Vue Router 4.6.3（MIT）：https://github.com/vuejs/core 和 https://github.com/vuejs/router
- Frappe UI 1.0.0（MIT）：https://github.com/frappe/frappe-ui
- Vite 7.3.2、Tailwind CSS 3.4.19（MIT）：https://github.com/vitejs/vite 和 https://github.com/tailwindlabs/tailwindcss

前端实装版本由 `apps/jingneng/frontend/package-lock.json` 固定。组件许可证随 npm 依赖保留；构建保留代码中的许可证注释。不复制上游字体包，工作台使用系统可用字体。

镜像中各组件保留各自许可证；本说明不把全部依赖概括成一个许可证，也不自动为本项目自有代码授予开源许可。

MIT 上游版权与许可原文保存于 `infra/upstream-frappe-docker-LICENSE`、`infra/upstream-frappe-ui-LICENSE`。
