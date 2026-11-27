# نصب دمو روی سرور شخصی

دمو فایل‌های ثابت است (رابط واقعی + API شبیه‌سازی‌شده در مرورگر) و فقط به nginx نیاز دارد؛ روی سرور ۱ گیگ رم به‌راحتی اجرا می‌شود.

```bash
# روی کامپیوتر خودتان (پوشه‌ای که man-demo.tar.gz در آن است):
scp man-demo.tar.gz root@SERVER_IP:/root/
ssh root@SERVER_IP
# روی سرور:
tar xzf man-demo.tar.gz && cd man-demo && bash install.sh
```

با دامنه و HTTPS رایگان: `bash install.sh demo.example.ir you@example.ir` (رکورد A دامنه باید به IP سرور اشاره کند).

ساخت دوباره‌ی بسته از روی کد:

```bash
cd backend && python manage.py seed_demo --reset && python manage.py export_demo ../frontend/demo-build/data.json
cp -r media ../frontend/demo-build/
cd ../frontend && node scripts/build-demo.mjs --standalone
cd ../deploy && tar czf man-demo.tar.gz --transform 's,^demo-server,man-demo,' demo-server
```
