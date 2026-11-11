const [name = "?", task = "?"] = process.argv.slice(2);
console.error(`Lệnh "${name}" chưa được triển khai (xem tasks/ ${task}).`);
process.exit(1);
