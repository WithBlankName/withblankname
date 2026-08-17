/**
 * js/moon-mode.js
 * 职责：超级月亮模式 - 最大过曝区域检测与覆盖贴图
 * 
 * 更新内容：
 * 1. 简化检测算法：不再进行 PCA 椭圆拟合和形状验证。
 * 2. 最大过曝区域识别：通过高亮度阈值提取连通域，选取面积最大的区域作为目标。
 * 3. 贴图覆盖逻辑：计算目标区域的外接圆半径，将 moon.png 放大并剪切为圆形，完全覆盖过曝区域。
 * 4. 黄色圆角空心框：在识别到的区域外围绘制正方形黄色圆角框。
 */

var MoonMode = {
    enabled: false,
    moonImage: null,
    imageLoaded: false,
    detectCanvas: null,
    detectCtx: null,
    previewCanvas: null,
    previewCtx: null,
    detectedMoon: null,        // 检测到的月亮 { x, y, radius }（视频原始分辨率坐标）
    rafId: null
};

/**
 * 初始化月亮模式
 */
function initMoonMode() {
    MoonMode.moonImage = new Image();
    MoonMode.moonImage.onload = function () {
        MoonMode.imageLoaded = true;
    };
    MoonMode.moonImage.onerror = function () {
        console.warn('moon.png 加载失败，将使用白色占位');
    };
    MoonMode.moonImage.src = 'assets/moon.png';

    MoonMode.detectCanvas = document.createElement('canvas');
    MoonMode.detectCtx = MoonMode.detectCanvas.getContext('2d', { willReadFrequently: true });

    MoonMode.previewCanvas = document.getElementById('moon-canvas');
    MoonMode.previewCtx = MoonMode.previewCanvas.getContext('2d');
}

/**
 * 启用月亮模式
 */
function startMoonMode() {
    MoonMode.enabled = true;
    if (MoonMode.rafId) cancelAnimationFrame(MoonMode.rafId);
    loopMoonDetect();
}

/**
 * 禁用月亮模式
 */
function stopMoonMode() {
    MoonMode.enabled = false;
    if (MoonMode.rafId) {
        cancelAnimationFrame(MoonMode.rafId);
        MoonMode.rafId = null;
    }
    if (MoonMode.previewCtx && MoonMode.previewCanvas) {
        MoonMode.previewCtx.clearRect(0, 0, MoonMode.previewCanvas.width, MoonMode.previewCanvas.height);
    }
    MoonMode.detectedMoon = null;
}

/**
 * 实时检测循环（每帧执行）
 */
function loopMoonDetect() {
    if (!MoonMode.enabled) return;

    var video = document.getElementById('camera-video');
    if (video && video.videoWidth > 0) {
        // 同步预览 canvas 尺寸到屏幕物理像素，解决 object-fit: cover 错位问题
        var dpr = window.devicePixelRatio || 1;
        var cw = window.innerWidth * dpr;
        var ch = window.innerHeight * dpr;

        if (MoonMode.previewCanvas.width !== cw) {
            MoonMode.previewCanvas.width = cw;
            MoonMode.previewCanvas.height = ch;
            MoonMode.previewCanvas.style.width = window.innerWidth + 'px';
            MoonMode.previewCanvas.style.height = window.innerHeight + 'px';
        }

        // 使用 320px 宽度进行检测，兼顾性能与效果
        var targetW = 320;
        var scale = targetW / video.videoWidth;
        var targetH = Math.round(video.videoHeight * scale);

        if (targetH >= 10) {
            var candidate = detectLargestOverexposedArea(video, targetW, targetH);
            
            if (candidate) {
                // 将检测结果映射回视频原始分辨率
                MoonMode.detectedMoon = {
                    x: candidate.x / scale,
                    y: candidate.y / scale,
                    radius: candidate.radius / scale
                };
            } else {
                MoonMode.detectedMoon = null;
            }
        }

        renderMoonPreview();
    }

    MoonMode.rafId = requestAnimationFrame(loopMoonDetect);
}

/**
 * 在指定尺度下检测面积最大的过曝区域
 * 算法：通过固定高亮度阈值(230)提取像素，使用 8 邻域 BFS 找出所有连通域，返回面积最大的那个。
 * @param {HTMLVideoElement} video
 * @param {number} w - 检测 canvas 宽度
 * @param {number} h - 检测 canvas 高度
 * @returns {object|null} - 包含中心坐标和外接圆半径的区域信息
 */
function detectLargestOverexposedArea(video, w, h) {
    MoonMode.detectCanvas.width = w;
    MoonMode.detectCanvas.height = h;
    var ctx = MoonMode.detectCtx;
    ctx.drawImage(video, 0, 0, w, h);

    var imgData = ctx.getImageData(0, 0, w, h);
    var data = imgData.data;

    // 过曝阈值：RGB 任意通道大于 230 视为高亮过曝
    var threshold = 230;
    var visited = new Uint8Array(w * h);
    
    var bestCandidate = null;
    var maxArea = 20; // 过滤掉极小的噪点（小于 20 像素）

    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var linearIdx = y * w + x;
            if (visited[linearIdx]) continue;

            var idx = linearIdx * 4;
            var r = data[idx], g = data[idx + 1], b = data[idx + 2];

            // 如果不是高亮像素，跳过
            if (r < threshold && g < threshold && b < threshold) continue;

            // BFS 寻找连通的高亮像素
            var queue = [linearIdx];
            var head = 0;
            visited[linearIdx] = 1;

            var sumX = 0, sumY = 0;
            var minX = x, maxX = x, minY = y, maxY = y;
            var count = 0;

            while (head < queue.length) {
                var cur = queue[head++];
                var cx = cur % w;
                var cy = (cur - cx) / w;

                sumX += cx;
                sumY += cy;
                count++;
                if (cx < minX) minX = cx;
                if (cx > maxX) maxX = cx;
                if (cy < minY) minY = cy;
                if (cy > maxY) maxY = cy;

                // 8 邻域搜索
                for (var dy = -1; dy <= 1; dy++) {
                    for (var dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        var nx = cx + dx, ny = cy + dy;
                        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                        var nLin = ny * w + nx;
                        if (!visited[nLin]) {
                            var nIdx = nLin * 4;
                            var nr = data[nIdx], ng = data[nIdx + 1], nb = data[nIdx + 2];
                            if (nr >= threshold || ng >= threshold || nb >= threshold) {
                                visited[nLin] = 1;
                                queue.push(nLin);
                            }
                        }
                    }
                }
            }

            // 如果当前区域面积比之前的最大值还大，则更新最优解
            if (count > maxArea) {
                maxArea = count;
                // 使用外接矩形的对角线长度的一半作为半径，确保能完全包围过曝区域
                var boxW = maxX - minX;
                var boxH = maxY - minY;
                var radius = Math.sqrt(boxW * boxW + boxH * boxH) / 2;

                bestCandidate = {
                    x: sumX / count, // 质心 X
                    y: sumY / count, // 质心 Y
                    radius: radius
                };
            }
        }
    }

    return bestCandidate;
}

/**
 * 在预览 canvas 上绘制月亮贴图和黄色圆角框
 */
function renderMoonPreview() {
    var ctx = MoonMode.previewCtx;
    var cw = MoonMode.previewCanvas.width;
    var ch = MoonMode.previewCanvas.height;
    ctx.clearRect(0, 0, cw, ch);

    if (!MoonMode.detectedMoon) return;

    var video = document.getElementById('camera-video');
    var vw = video.videoWidth;
    var vh = video.videoHeight;
    if (vw === 0 || vh === 0) return;

    // 计算视频 object-fit: cover 在屏幕上的实际缩放与偏移
    var scale = Math.max(cw / vw, ch / vh);
    var dispW = vw * scale;
    var dispH = vh * scale;
    var offsetX = (cw - dispW) / 2;
    var offsetY = (ch - dispH) / 2;

    var m = MoonMode.detectedMoon;
    
    // 将视频原始坐标转换为屏幕实际渲染坐标
    var screenX = offsetX + m.x * scale;
    var screenY = offsetY + m.y * scale;
    var screenR = m.radius * scale;

    // === 1. 渲染月亮贴图 (放大覆盖整个过曝区域) ===
    if (MoonMode.imageLoaded) {
        ctx.save();
        
        // 以过曝区域中心为圆心，半径为 screenR 进行圆形剪切
        ctx.beginPath();
        ctx.arc(screenX, screenY, screenR, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        
        // 计算 moon.png 的等比例缩放，确保短边等于 2 * screenR，从而完全覆盖圆形区域
        var img = MoonMode.moonImage;
        var imgRatio = img.width / img.height;
        var drawW, drawH;
        
        if (imgRatio > 1) {
            // 宽图，以高为基准
            drawH = screenR * 2;
            drawW = drawH * imgRatio;
        } else {
            // 高图或正方形图，以宽为基准
            drawW = screenR * 2;
            drawH = drawW / imgRatio;
        }
        
        // 居中绘制贴图
        ctx.drawImage(img, screenX - drawW / 2, screenY - drawH / 2, drawW, drawH);
        ctx.restore();
    } else {
        // 图片未加载时的白色圆形占位
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(screenX, screenY, screenR, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    // === 2. 绘制黄色圆角空心框 ===
    ctx.save();
    
    var padding = 16 * scale; // 边距随屏幕缩放
    var rectSize = screenR * 2 + padding * 2; // 正方形边长
    var radius = 12 * scale;  // 圆角半径随屏幕缩放
    
    ctx.strokeStyle = '#FFFF00'; // 黄色
    ctx.lineWidth = 4 * scale;   // 线宽随屏幕缩放
    ctx.beginPath();
    
    // 兼容性圆角矩形绘制 (以中心点为基准)
    var rx = screenX - rectSize / 2;
    var ry = screenY - rectSize / 2;
    
    if (ctx.roundRect) {
        ctx.roundRect(rx, ry, rectSize, rectSize, radius);
    } else {
        if (rectSize < 2 * radius) radius = rectSize / 2;
        ctx.moveTo(rx + radius, ry);
        ctx.arcTo(rx + rectSize, ry, rx + rectSize, ry + rectSize, radius);
        ctx.arcTo(rx + rectSize, ry + rectSize, rx, ry + rectSize, radius);
        ctx.arcTo(rx, ry + rectSize, rx, ry, radius);
        ctx.arcTo(rx, ry, rx + rectSize, ry, radius);
        ctx.closePath();
    }
    ctx.stroke();
    ctx.restore();
}

/**
 * 合成视频帧 + 月亮贴图到指定 canvas 上下文（用于拍照保存）
 */
function composeMoonShot(ctx, w, h) {
    var video = document.getElementById('camera-video');

    // 1. 绘制视频帧作为底图
    ctx.drawImage(video, 0, 0, w, h);

    // 2. 叠加月亮贴图（使用视频原始坐标，无需转换）
    if (MoonMode.detectedMoon && MoonMode.imageLoaded) {
        var m = MoonMode.detectedMoon;
        
        ctx.save();
        // 圆形剪切
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        
        // 等比例放大贴图，覆盖圆形区域
        var img = MoonMode.moonImage;
        var imgRatio = img.width / img.height;
        var drawW, drawH;
        
        if (imgRatio > 1) {
            drawH = m.radius * 2;
            drawW = drawH * imgRatio;
        } else {
            drawW = m.radius * 2;
            drawH = drawW / imgRatio;
        }
        
        ctx.drawImage(img, m.x - drawW / 2, m.y - drawH / 2, drawW, drawH);
        ctx.restore();
    }
    // 注意：截图保存时不画黄色框，保持照片干净
}

// 暴露到全局
window.MoonMode = MoonMode;
window.initMoonMode = initMoonMode;
window.startMoonMode = startMoonMode;
window.stopMoonMode = stopMoonMode;
window.composeMoonShot = composeMoonShot;