find . \
  -type d \( -name "node_modules" -o -name ".git" -o -name "venv" -o -name "chrome-data" -o -name "jobs" \) -prune -o \
  -type f -print | sed 's|^\./||' > all_files.txt 