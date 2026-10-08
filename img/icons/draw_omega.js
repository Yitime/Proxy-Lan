globalThis.drawOmega = function (ctx, outerCircleColor, automatic) {
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = outerCircleColor;

  ctx.beginPath();
  ctx.lineWidth = 0.25;
  ctx.arc(0.5, 0.5, 0.375, 0, Math.PI * 2, true);

  ctx.closePath();
  ctx.stroke();

  ctx.globalCompositeOperation = "destination-out";

  ctx.beginPath();
  ctx.arc(0.5, 0.5, 0.25, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.fill();

  if (automatic) {
    // Draw A as a path so the marker stays consistent at small sizes without fonts.
    ctx.globalCompositeOperation = "source-over";
    ctx.lineWidth = 0.06;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(0.36, 0.69);
    ctx.lineTo(0.5, 0.3);
    ctx.lineTo(0.64, 0.69);
    ctx.moveTo(0.405, 0.56);
    ctx.lineTo(0.595, 0.56);
    ctx.stroke();
  }
};
