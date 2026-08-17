/**
 * js/device-detect.js
 * 职责：通过 User Agent 检测访问设备类型
 *  - 匹配 /Android|iPhone|iPad|Mobile/i 为手机端
 *  - 否则视为电脑端，在 <body> 上添加 class="desktop-block"
 *  - desktop-block 类会触发 css/desktop.css 中的遮罩层显示
 * 必须最先执行，因此独立文件并在 HTML 中第一个加载
 */

(function () {
    'use strict';

    // 获取 User Agent 字符串（兼容旧浏览器）
    var ua = navigator.userAgent || navigator.vendor || window.opera || '';

    // 手机端标识正则：Android / iPhone / iPad / Mobile
    var isMobile = /Android|iPhone|iPad|Mobile/i.test(ua);

    if (!isMobile) {
        // 电脑端：添加遮罩类，禁用相机界面
        // 用 classList.add 兼容性较好；若 DOM 未就绪则等待 DOMContentLoaded
        var apply = function () {
            document.body.classList.add('desktop-block');
        };
        if (document.body) {
            apply();
        } else {
            document.addEventListener('DOMContentLoaded', apply);
        }
    }
    // 手机端：不添加任何类，正常加载相机界面（由 camera.js 接管）
})();