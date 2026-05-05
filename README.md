
# Run frontend
```bash
docker compose up frontend --build --no-deps -d
```

# Run everything
```bash
docker compose up
```

# Stop / Finish
```bash
docker compose down
```

# Run 
```bash
docker compose -f docker-compose.app.yml up -d # Start

docker compose -f docker-compose.app.yml logs -f backend # Backend output
docker compose -f docker-compose.app.yml logs -f frontend # Frontend output
docker compose -f docker-compose.app.yml down # Stop


```

# DB (You don't need this)
```bash
docker exec -it hpdav-db psql -U harnitsytsky -d hpdav_db
```