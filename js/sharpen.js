/**
 * js/sharpen.js
 * 职责：对 canvas 中的图像执行 3x3 卷积超级锐化
 *
 * 卷积核（中心权重 5，上下左右各 -1，四角 0）：
 *   [  0, -1,  0 ]
 *   [ -1,  5, -1 ]
 *   [  0, -1,  0 ]
 *
 * 处理方式：原地修改传入 canvas 的像素数据
 * 边缘 1 像素保留原值（避免越界与黑边）
 */

/**
 * 对 canvas 中的图像执行锐化（原地修改）
 * @param {CanvasRenderingContext2D} ctx - canvas 2D 上下文
 * @param {number} width - 图像宽度
 * @param {number} height - 图像高度
 */
function applySharpen(ctx, width, height) {
    // 获取原始像素数据
    var src = ctx.getImageData(0, 0, width, height);
    var srcData = src.data;

    // 创建目标像素数据
    var dst = ctx.createImageData(width, height);
    var dstData = dst.data;

    // 3x3 锐化卷积核（行优先）
    var kernel = [
         0, -1,  0,
        -1,  5, -1,
         0, -1,  0
    ];

    // 遍历每个像素（跳过边缘 1px 以避免越界）
    for (var y = 1; y < height - 1; y++) {
        for (var x = 1; x < width - 1; x++) {
            var idx = (y * width + x) * 4;

            // 对 R / G / B 三通道分别卷积
            for (var c = 0; c < 3; c++) {
                var sum = 0;
                var k = 0;
                // 遍历 3x3 邻域
                for (var ky = -1; ky <= 1; ky++) {
                    for (var kx = -1; kx <= 1; kx++) {
                        var pIdx = ((y + ky) * width + (x + kx)) * 4 + c;
                        sum += srcData[pIdx] * kernel[k++];
                    }
                }
                // 限制到 0-255 范围
                dstData[idx + c] = sum < 0 ? 0 : (sum > 255 ? 255 : sum);
            }
            // Alpha 通道保持不变
            dstData[idx + 3] = srcData[idx + 3];
        }
    }

    // 复制边缘像素（保持原值，避免黑边）
    copyBorderPixels(srcData, dstData, width, height);

    // 写回 canvas
    ctx.putImageData(dst, 0, 0);
}

/**
 * 将 src 中边缘 1 像素的值复制到 dst
 * @param {Uint8ClampedArray} src
 * @param {Uint8ClampedArray} dst
 * @param {number} w
 * @param {number} h
 */
function copyBorderPixels(src, dst, w, h) {
    var x, y, i;

    // 顶部 (y=0) 和底部 (y=h-1)
    for (x = 0; x < w; x++) {
        i = (0 * w + x) * 4;
        dst[i] = src[i]; dst[i + 1] = src[i + 1]; dst[i + 2] = src[i + 2]; dst[i + 3] = src[i + 3];
        i = ((h - 1) * w + x) * 4;
        dst[i] = src[i]; dst[i + 1] = src[i + 1]; dst[i + 2] = src[i + 2]; dst[i + 3] = src[i + 3];
    }
    // 左侧 (x=0) 和右侧 (x=w-1)
    for (y = 0; y < h; y++) {
        i = (y * w + 0) * 4;
        dst[i] = src[i]; dst[i + 1] = src[i + 1]; dst[i + 2] = src[i + 2]; dst[i + 3] = src[i + 3];
        i = (y * w + (w - 1)) * 4;
        dst[i] = src[i]; dst[i + 1] = src[i + 1]; dst[i + 2] = src[i + 2]; dst[i + 3] = src[i + 3];
    }
}

// 暴露到全局
window.applySharpen = applySharpen;