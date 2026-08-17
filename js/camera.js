/**
 * js/camera.js
 * 职责：
 *  1. 启动手机端后置摄像头预览（getUserMedia，facingMode: environment）
 *  2. 绑定快门按钮：
 *     - 自动模式 → 截取当前视频帧到 canvas → 调用 applySharpen 锐化 → 下载 PNG
 *     - 月亮模式 → 调用 composeMoonShot 合成 → 下载 PNG（未检测到月亮则 toast 提示）
 *  3. 绑定模式切换（自动模式 / 超级月亮模式），切换时启停 moon-mode 实时循环
 *  4. 提供 Toast 提示与 PNG 下载工具函数
 * 依赖：sharpen.js（applySharpen）、moon-mode.js（initMoonMode / startMoonMode / stopMoonMode / composeMoonShot / MoonMode）
 */

(function () {
    'use strict';

    // 当前拍摄模式：'auto' 或 'moon'
    var currentMode = 'auto';

    // 相机视频流引用（用于停止/释放）
    var mediaStream = null;

    // 处理用 canvas（DOM 中的 #process-canvas，隐藏不显示）
    var processCanvas = null;
    var processCtx = null;

    /**
     * DOM 就绪后初始化
     */
    document.addEventListener('DOMContentLoaded', function () {
        // 电脑端被遮罩，不启动相机
        if (document.body.classList.contains('desktop-block')) {
            return;
        }

        processCanvas = document.getElementById('process-canvas');
        processCtx = processCanvas.getContext('2d');

        initCamera();
        initMoonMode();   // 预加载 moon.png，准备 canvas
        bindEvents();
    });

    /**
     * 启动后置摄像头预览
     */
    function initCamera() {
        var video = document.getElementById('camera-video');

        // API 兼容检测
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast('当前浏览器不支持相机访问');
            return;
        }

        // 优先请求后置摄像头
        navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false
        }).then(function (stream) {
            mediaStream = stream;
            video.srcObject = stream;
            video.onloadedmetadata = function () {
                video.play().catch(function () {});
            };
        }).catch(function (err) {
            console.warn('后置摄像头获取失败，回退到默认摄像头：', err);
            // 回退：尝试任意摄像头
            navigator.mediaDevices.getUserMedia({ video: true, audio: false })
                .then(function (stream) {
                    mediaStream = stream;
                    video.srcObject = stream;
                    video.onloadedmetadata = function () {
                        video.play().catch(function () {});
                    };
                })
                .catch(function () {
                    showToast('无法访问摄像头，请检查权限');
                });
        });
    }

    /**
     * 绑定模式切换按钮与快门按钮
     */
    function bindEvents() {
        // 模式切换
        var modeBtns = document.querySelectorAll('.mode-btn');
        for (var i = 0; i < modeBtns.length; i++) {
            modeBtns[i].addEventListener('click', function () {
                for (var j = 0; j < modeBtns.length; j++) {
                    modeBtns[j].classList.remove('active');
                }
                this.classList.add('active');
                currentMode = this.getAttribute('data-mode');

                if (currentMode === 'moon') {
                    startMoonMode();
                    showToast('已切换至超级月亮模式');
                } else {
                    stopMoonMode();
                    showToast('已切换至自动模式');
                }
            });
        }

        // 快门
        var shutter = document.getElementById('shutter');
        shutter.addEventListener('click', onShutter);
    }

    /**
     * 快门按下：根据当前模式分发
     */
    function onShutter() {
        var video = document.getElementById('camera-video');
        if (!video || !video.videoWidth) {
            showToast('相机尚未就绪');
            return;
        }

        if (currentMode === 'moon') {
            captureMoon();
        } else {
            captureAuto();
        }
    }

    /**
     * 自动模式：截取视频帧 → 3x3 卷积锐化 → 下载 PNG
     */
    function captureAuto() {
        var video = document.getElementById('camera-video');
        var w = video.videoWidth;
        var h = video.videoHeight;

        processCanvas.width = w;
        processCanvas.height = h;

        // 1. 截取当前视频帧到 canvas
        processCtx.drawImage(video, 0, 0, w, h);

        // 2. 执行超级锐化（3x3 卷积核：中心 5，上下左右 -1，四角 0）
        applySharpen(processCtx, w, h);

        // 3. 下载为 PNG
        downloadCanvas(processCanvas, 'leading-camera_' + Date.now() + '.png');
        showToast('已保存锐化照片');
    }

    /**
     * 月亮模式：合成视频帧 + 月亮贴图 → 下载 PNG
     * 若未检测到月亮，则 toast 提示
     */
    function captureMoon() {
        if (!MoonMode.detectedMoon) {
            showToast('未检测到月亮');
            return;
        }

        var video = document.getElementById('camera-video');
        var w = video.videoWidth;
        var h = video.videoHeight;

        processCanvas.width = w;
        processCanvas.height = h;

        // 合成：视频帧 + moon.png 贴图
        composeMoonShot(processCtx, w, h);

        downloadCanvas(processCanvas, 'leading-camera_moon_' + Date.now() + '.png');
        showToast('已保存月亮合成照片');
    }

    /**
     * 将 canvas 内容下载为 PNG 文件
     * 使用 canvas.toBlob() + URL.createObjectURL() + <a download>
     * @param {HTMLCanvasElement} canvas
     * @param {string} filename - 下载文件名
     */
    function downloadCanvas(canvas, filename) {
        canvas.toBlob(function (blob) {
            if (!blob) {
                showToast('图片生成失败');
                return;
            }
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            // 延迟释放对象 URL，确保下载已开始
            setTimeout(function () {
                URL.revokeObjectURL(url);
            }, 1500);
        }, 'image/png');
    }

    // ===== Toast 工具 =====
    var toastTimer = null;
    /**
     * 显示 Toast 提示（2 秒后自动隐藏）
     * @param {string} msg
     */
    function showToast(msg) {
        var toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.add('show');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            toast.classList.remove('show');
        }, 2000);
    }

    // 暴露 showToast 给其他模块使用（moon-mode 无需直接调用，但保留接口）
    window.showToast = showToast;
})();