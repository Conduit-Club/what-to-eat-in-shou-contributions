/**
 * 审核台页面。由投稿服务自身提供，避免把审核令牌放进公开站点。
 * 令牌只存在浏览器的 sessionStorage，页面与仓库都不写入任何凭据。
 */
export const adminUiHtml = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>投稿审核台</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0 auto; max-width: 1100px; padding: 1.5rem; line-height: 1.6; }
  h1 { font-size: 1.4rem; }
  h2 { font-size: 1.05rem; }
  .muted { opacity: .7; font-size: .9rem; }
  .bar { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; margin-bottom: 1rem; }
  input, select, textarea, button { font: inherit; padding: .35rem .5rem; }
  textarea { width: 100%; min-height: 5rem; box-sizing: border-box; }
  .columns { display: grid; grid-template-columns: minmax(220px, 300px) 1fr; gap: 1.25rem; align-items: start; }
  @media (max-width: 820px) { .columns { grid-template-columns: 1fr; } }
  ul.items { list-style: none; margin: 0; padding: 0; border: 1px solid rgba(127,127,127,.5); border-radius: .5rem; max-height: 70vh; overflow: auto; }
  ul.items button { display: block; width: 100%; box-sizing: border-box; text-align: left; background: none; border: 0; border-bottom: 1px solid rgba(127,127,127,.3); color: inherit; padding: .6rem .75rem; cursor: pointer; }
  ul.items li:last-child button { border-bottom: 0; }
  ul.items button[aria-current="true"] { background: rgba(127,127,127,.18); }
  ul.items button:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
  fieldset { border: 1px solid rgba(127,127,127,.5); border-radius: .5rem; margin: 0 0 1rem; padding: .75rem; }
  legend { padding: 0 .35rem; }
  label.field { display: block; margin-bottom: .6rem; }
  label.field > span { display: block; font-size: .85rem; opacity: .8; }
  label.field input[type="text"], label.field select, label.field textarea { width: 100%; box-sizing: border-box; }
  img.preview { max-width: 100%; max-height: 380px; border-radius: .4rem; border: 1px solid rgba(127,127,127,.5); background: rgba(127,127,127,.12); }
  .row { display: flex; gap: .6rem; flex-wrap: wrap; align-items: center; }
  .status { min-height: 1.4rem; font-size: .9rem; }
  .status[data-kind="error"] { color: #c0392b; }
  .status[data-kind="ok"] { color: #1e824c; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: .25rem .75rem; margin: 0 0 .75rem; }
  dt { opacity: .7; }
  dd { margin: 0; word-break: break-word; }
</style>
</head>
<body>
<h1>投稿审核台</h1>
<p class="muted">需要审核者令牌。令牌只保存在当前标签页的 sessionStorage，不写入页面、仓库或日志。批准只记录公开字段，导出仍由导出脚本单独执行。</p>
<div class="bar">
  <label>令牌 <input id="token" type="password" autocomplete="off" size="24" /></label>
  <button id="load" type="button">加载待审列表</button>
  <span id="listStatus" class="status"></span>
</div>
<div class="columns">
  <div>
    <h2>待审 <span id="count" class="muted"></span></h2>
    <ul class="items" id="items"></ul>
  </div>
  <div id="detail" hidden>
    <h2 id="detailTitle">投稿详情</h2>
    <div class="row"><img id="preview" class="preview" alt="投稿图片" hidden /></div>
    <dl id="meta"></dl>
    <fieldset>
      <legend>批准并记录公开字段</legend>
      <label class="field"><span>稳定标识（小写英文、数字与连字符）</span><input id="f_id" type="text" placeholder="例如 second-canteen-suan-cai-yu" /></label>
      <label class="field"><span>名称</span><input id="f_name" type="text" /></label>
      <label class="field"><span>就餐范围</span><select id="f_category"><option value="on-campus">校内</option><option value="off-campus">校外</option></select></label>
      <label class="field"><span>位置</span><input id="f_location" type="text" /></label>
      <label class="field"><span>口感（须以「同学反馈：」开头）</span><textarea id="f_taste"></textarea></label>
      <label class="field"><span>营业时间（未知留空）</span><input id="f_hours" type="text" /></label>
      <label class="field"><span>消费范围</span><input id="f_price" type="text" /></label>
      <label class="field"><span>核验日期（仅在核验事实时填写）</span><input id="f_updated" type="date" /></label>
      <label class="row"><input id="f_image" type="checkbox" /> 图片已获公开授权</label>
      <div class="row"><button id="approve" type="button">批准</button><span id="reviewStatus" class="status"></span></div>
    </fieldset>
    <fieldset>
      <legend>拒绝</legend>
      <label class="field"><span>原因（必填）</span><textarea id="f_reason"></textarea></label>
      <div class="row"><button id="reject" type="button">拒绝</button></div>
    </fieldset>
  </div>
</div>
<script>
(function () {
  'use strict';
  var tokenInput = document.getElementById('token');
  var listStatus = document.getElementById('listStatus');
  var reviewStatus = document.getElementById('reviewStatus');
  var items = document.getElementById('items');
  var count = document.getElementById('count');
  var detail = document.getElementById('detail');
  var current = null;
  var previewUrl = null;

  tokenInput.value = sessionStorage.getItem('reviewerToken') || '';

  function say(node, message, kind) { node.textContent = message; node.setAttribute('data-kind', kind || ''); }
  function authHeaders(extra) { var headers = extra || {}; headers.Authorization = 'Bearer ' + tokenInput.value.trim(); return headers; }
  function api(path, options) {
    var config = options || {};
    config.headers = authHeaders(config.headers);
    return fetch(path, config).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (payload) {
        if (!response.ok) { throw new Error((payload && payload.error && payload.error.message) || ('HTTP ' + response.status)); }
        return payload;
      });
    });
  }
  function slugify(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function publicTaste(value) {
    var text = String(value || '').trim();
    return text.indexOf('同学反馈：') === 0 ? text : '同学反馈：' + text;
  }
  function checkApproval(fields) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.id)) return '稳定标识必须是英文小写、数字与单个连字符，且不能为空；中文名称需要你另填一个标识。';
    if (!fields.name) return '名称不能为空。';
    if (fields.taste.indexOf('同学反馈：') !== 0) return '口感必须以「同学反馈：」开头。';
    return '';
  }
  function setValue(id, value) { document.getElementById(id).value = value == null ? '' : value; }
  function resetPreview() {
    var preview = document.getElementById('preview');
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    preview.hidden = true;
    preview.removeAttribute('src');
  }

  function load() {
    sessionStorage.setItem('reviewerToken', tokenInput.value.trim());
    say(listStatus, '加载中…');
    items.replaceChildren();
    detail.hidden = true;
    current = null;
    resetPreview();
    api('/v1/admin/submissions?status=pending').then(function (payload) {
      var list = (payload && payload.submissions) || [];
      count.textContent = '共 ' + list.length + ' 条';
      say(listStatus, list.length ? '' : '没有待审投稿。', list.length ? '' : 'ok');
      list.forEach(function (submission) {
        var metadata = submission.metadata || {};
        var li = document.createElement('li');
        var button = document.createElement('button');
        button.type = 'button';
        button.textContent = metadata.name || submission.id;
        var meta = document.createElement('div');
        meta.className = 'muted';
        meta.textContent = (metadata.location || '') + ' · ' + (metadata.visitedAt || '');
        button.appendChild(meta);
        button.addEventListener('click', function () { select(submission, button); });
        li.appendChild(button);
        items.appendChild(li);
      });
    }).catch(function (error) { say(listStatus, '加载失败：' + error.message, 'error'); });
  }

  function select(submission, li) {
    Array.prototype.forEach.call(items.querySelectorAll('button'), function (child) { child.removeAttribute('aria-current'); });
    if (li) li.setAttribute('aria-current', 'true');
    current = submission;
    detail.hidden = false;
    say(reviewStatus, '');
    var metadata = submission.metadata || {};
    document.getElementById('detailTitle').textContent = metadata.name || submission.id;
    var rows = [['投稿 ID', submission.id], ['状态', submission.status], ['提交时间', submission.createdAt], ['名称', metadata.name], ['范围', metadata.category], ['位置', metadata.location], ['口感', metadata.taste], ['营业时间', metadata.openingHours], ['用餐日期', metadata.visitedAt], ['原始文件名', metadata.imageFilename]];
    var meta = document.getElementById('meta');
    meta.replaceChildren();
    rows.forEach(function (pair) {
      var dt = document.createElement('dt'); dt.textContent = pair[0];
      var dd = document.createElement('dd'); dd.textContent = pair[1] == null || pair[1] === '' ? '—' : String(pair[1]);
      meta.appendChild(dt); meta.appendChild(dd);
    });
    setValue('f_id', slugify(metadata.name));
    setValue('f_name', metadata.name);
    setValue('f_category', metadata.category);
    setValue('f_location', metadata.location);
    setValue('f_taste', publicTaste(metadata.taste));
    setValue('f_hours', metadata.openingHours === '待补充' ? '' : metadata.openingHours);
    setValue('f_price', '待补充。');
    setValue('f_updated', '');
    setValue('f_reason', '');
    document.getElementById('f_image').checked = false;
    resetPreview();
    fetch('/v1/admin/submissions/' + encodeURIComponent(submission.id) + '/image', { headers: authHeaders() }).then(function (response) {
      if (!response.ok) { throw new Error('HTTP ' + response.status); }
      return response.blob();
    }).then(function (blob) {
      var preview = document.getElementById('preview');
      previewUrl = URL.createObjectURL(blob);
      preview.src = previewUrl;
      preview.hidden = false;
    }).catch(function () { say(reviewStatus, '图片读取失败，请确认令牌有效。', 'error'); });
  }

  function review(action, body) {
    if (!current) { return; }
    say(reviewStatus, '提交中…');
    api('/v1/admin/submissions/' + encodeURIComponent(current.id) + '/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function () {
      say(reviewStatus, action === 'approve' ? '已批准。' : '已拒绝。', 'ok');
      load();
    }).catch(function (error) { say(reviewStatus, '操作失败：' + error.message, 'error'); });
  }

  document.getElementById('load').addEventListener('click', load);
  document.getElementById('approve').addEventListener('click', function () {
    var updated = document.getElementById('f_updated').value;
    var fields = {
      id: document.getElementById('f_id').value.trim(),
      name: document.getElementById('f_name').value.trim(),
      category: document.getElementById('f_category').value,
      location: document.getElementById('f_location').value.trim(),
      taste: document.getElementById('f_taste').value.trim(),
      openingHours: document.getElementById('f_hours').value.trim() || null,
      price: document.getElementById('f_price').value.trim() || '待补充。',
      updatedAt: updated || null,
      imageApproved: document.getElementById('f_image').checked
    };
    var problem = checkApproval(fields);
    if (problem) { say(reviewStatus, problem, 'error'); return; }
    review('approve', { action: 'approve', publicFields: fields });
  });
  document.getElementById('reject').addEventListener('click', function () {
    review('reject', { action: 'reject', reason: document.getElementById('f_reason').value.trim() });
  });
})();
</script>
</body>
</html>
`;
