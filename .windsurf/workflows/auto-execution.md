---
description: CinoCode projesi için otomatik komut çalıştırma kuralları
---

Bu workflow yalnız CinoCode (Text-Generator) projesi için geçerlidir.

## Otomatik Çalıştırılacak İşlemler

Aşağıdaki işlemler için SafeToAutoRun kullan ve tek tek onay isteme:
- Dosya okuma ve arama
- git status
- git diff
- git log
- git show
- git ls-files
- git ls-tree
- node --check
- npm test
- npm run check:serverless
- git diff --check
- Salt okunur analiz
- Görev kapsamındaki dosyalarda düzenleme

## Mutlaka Onay Gerektiren İşlemler

Aşağıdaki işlemlerde her zaman dur ve benden onay iste:
- git commit / git commit --amend
- git push
- deploy (netlify deploy, vercel deploy vb.)
- git reset / restore / revert / clean
- Branch değiştirme
- git rebase
- git merge
- Dosya veya klasör silme
- Package ekleme veya kaldırma (npm install, npm uninstall)
- .env ve secret değişiklikleri

## SafeToAutoRun Kullanımı

Güvenli komutlarda bash tool çağrılırken SafeToAutoRun: true parametresi kullan.

## Görev Sonrası Rapor

Her görev sonunda şu raporu ver:
- Yapılan değişiklikler
- Çalışan testler
- Kalan riskler
- Sonraki önerilen adım
