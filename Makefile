up:
	docker compose -p knigopis-local -f deployments/docker-compose.local.yml up -d --build

stop:
	docker compose -p knigopis-local -f deployments/docker-compose.local.yml stop
