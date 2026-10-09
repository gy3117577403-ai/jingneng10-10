# Based on frappe/frappe_docker images/layered/Containerfile.
# Upstream reference: ca1826c21f7fa5c5b0ace69fd2ab297585154a52 (MIT).
FROM frappe/build@sha256:b3a1d4ac869b8f723c1ad1fc085f585b2caa3874b756a07b1f6112b7ac3ecafc AS builder

USER frappe
RUN bench init \
    --frappe-branch=v16.51.0 \
    --frappe-path=https://github.com/frappe/frappe \
    --no-procfile --no-backups --skip-redis-config-generation \
    /home/frappe/frappe-bench \
    && test "$(git -C /home/frappe/frappe-bench/apps/frappe rev-parse HEAD)" = "6b450a166e076dd842e4db7ea0843f62881e62ac"

WORKDIR /home/frappe/frappe-bench
COPY --chown=frappe:0 apps/jingneng ./apps/jingneng
RUN cd apps/jingneng/frontend && npm ci --no-audit --no-fund && npm run build
RUN env/bin/pip install --no-deps -e apps/jingneng \
    && printf '\njingneng\n' >> sites/apps.txt \
    && bench build --app jingneng \
    && printf '{}\n' > sites/common_site_config.json \
    && mv sites/assets assets

FROM frappe/base@sha256:22de66c37a2a8258924049ca4feda50b2c5a3d9c6c50e60de2c660ff9d8824a2
LABEL org.opencontainers.image.source="https://github.com/gy3117577403-ai/jingneng10-10"
LABEL org.opencontainers.image.description="Jingneng local demonstration foundation; Frappe 16.51.0"

COPY --from=builder --chown=frappe:0 /home/frappe/frappe-bench /home/frappe/frappe-bench
COPY --chown=frappe:0 infra/runtime /opt/jingneng
COPY --chmod=755 infra/start.sh /usr/local/bin/start.sh
USER root
RUN python /opt/jingneng/patch_nginx_template.py
USER frappe
WORKDIR /home/frappe/frappe-bench
ENTRYPOINT ["python", "/opt/jingneng/entrypoint.py"]
CMD ["start.sh"]
