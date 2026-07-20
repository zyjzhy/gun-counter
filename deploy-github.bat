@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ================================
echo   部 署 到 GitHub + Zeabur
echo ================================
echo.

:: 设置 git 信息
git config user.email "deploy@github.com"
git config user.name "deploy"

:: 获取仓库名
set /p REPO="输入 GitHub 仓库名 (默认 gun-counter): "
if "%REPO%"=="" set REPO=gun-counter

:: 获取 GitHub 用户名
set /p USER="输入你的 GitHub 用户名: "

:: 创建 GitHub 仓库 (需要个人访问令牌)
echo.
echo 需要 GitHub Personal Access Token
echo 去 https://github.com/settings/tokens 创建
echo 勾选 repo 权限，复制 token
echo.
set /p TOKEN="输入你的 Token: "

:: 用 API 创建仓库
curl -s -X POST -H "Authorization: token %TOKEN%" -H "Accept: application/vnd.github.v3+json" -d "{\"name\":\"%REPO%\",\"private\":false}" https://api.github.com/user/repos >nul

:: git 推送
git remote add origin https://%USER%:%TOKEN%@github.com/%USER%/%REPO%.git
git add -A
git commit -m "init" >nul 2>&1
git push -u origin master

echo.
echo ✓ 已推送到 GitHub！
echo.
echo 现在打开 https://zeabur.com
echo 用 GitHub 登录 → 创建项目 → 导入仓库 %REPO%
echo Zeabur 会自动部署，给一个永久域名
echo.
pause
