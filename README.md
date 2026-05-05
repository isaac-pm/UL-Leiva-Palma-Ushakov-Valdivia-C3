
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
```bash
docker exec -it hpdav-db psql -U harnitsytsky -d hpdav_db -c "CREATE USER palma WITH PASSWORD 'hpdav_2026_pass';"
docker exec -it hpdav-db psql -U harnitsytsky -d hpdav_db -c "CREATE DATABASE db_palma OWNER palma;"
docker exec -it hpdav-db psql -U harnitsytsky -d hpdav_db -c "GRANT ALL PRIVILEGES ON DATABASE db_palma TO palma;"
```

```bash
docker exec -it hpdav-db psql -U harnitsytsky -d hpdav_db -c "CREATE USER ushakov WITH PASSWORD 'hpdav_2026_pass';"
docker exec -it hpdav-db psql -U harnitsytsky -d hpdav_db -c "CREATE DATABASE db_ushakov OWNER ushakov;"
docker exec -it hpdav-db psql -U harnitsytsky -d hpdav_db -c "GRANT ALL PRIVILEGES ON DATABASE db_ushakov TO ushakov;"
```
```bash
docker exec -it hpdav-db psql -U harnitsytsky -d hpdav_db -c "CREATE USER valdivia WITH PASSWORD 'hpdav_2026_pass';"
docker exec -it hpdav-db psql -U harnitsytsky -d hpdav_db -c "CREATE DATABASE db_valdivia OWNER valdivia;"
docker exec -it hpdav-db psql -U harnitsytsky -d hpdav_db -c "GRANT ALL PRIVILEGES ON DATABASE db_valdivia TO valdivia;"
```