(() => {
  // danmu-src/emitter.ts
  var Emitter = class {
    // 处理函数
    listeners = {};
    /**
     * 订阅事件
     * @param event 事件名称
     * @param handler 事件处理函数
     */
    on(event, handler) {
      if (!this.listeners[event]) {
        this.listeners[event] = /* @__PURE__ */ new Set();
      }
      this.listeners[event].add(handler);
    }
    /**
     * 取消订阅
     * @param event 事件名称
     * @param handler 要移除的事件处理函数
     */
    off(event, handler) {
      const handlers = this.listeners[event];
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          delete this.listeners[event];
        }
      }
    }
    /**
     * 触发事件
     * @param event 事件名称
     * @param args 传递给处理函数的参数
     */
    emit(event, ...args) {
      const handlers = this.listeners[event];
      if (handlers) {
        const handlersCopy = new Set(handlers);
        handlersCopy.forEach((handler) => {
          handler(...args);
        });
      }
    }
    /**
     * 一次性订阅
     * @param event 事件名称
     * @param handler 事件处理函数
     */
    once(event, handler) {
      const onceHandler = (...args) => {
        this.off(event, onceHandler);
        handler(...args);
      };
      this.on(event, onceHandler);
    }
    /**
     * 获取指定事件的订阅数量
     * @param event 事件名称
     */
    listenerCount(event) {
      return this.listeners[event]?.size || 0;
    }
    /**
     * 清除所有事件监听器或指定事件的所有监听器
     * @param event 可选，要清除的事件名称
     */
    clear(event) {
      if (event) {
        delete this.listeners[event];
      } else {
        this.listeners = {};
      }
    }
  };

  // node_modules/pako/dist/pako.mjs
  var Z_FIXED = 4;
  var Z_BINARY = 0;
  var Z_TEXT = 1;
  var Z_UNKNOWN = 2;
  function zero$1(buf) {
    let len = buf.length;
    while (--len >= 0) buf[len] = 0;
  }
  var STORED_BLOCK = 0;
  var STATIC_TREES = 1;
  var DYN_TREES = 2;
  var LENGTH_CODES = 29;
  var LITERALS = 256;
  var L_CODES = 286;
  var D_CODES = 30;
  var BL_CODES = 19;
  var HEAP_SIZE$1 = 573;
  var MAX_BITS = 15;
  var Buf_size = 16;
  var END_BLOCK = 256;
  var REP_3_6 = 16;
  var REPZ_3_10 = 17;
  var REPZ_11_138 = 18;
  var extra_lbits = new Uint8Array([
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    1,
    1,
    1,
    2,
    2,
    2,
    2,
    3,
    3,
    3,
    3,
    4,
    4,
    4,
    4,
    5,
    5,
    5,
    5,
    0
  ]);
  var extra_dbits = new Uint8Array([
    0,
    0,
    0,
    0,
    1,
    1,
    2,
    2,
    3,
    3,
    4,
    4,
    5,
    5,
    6,
    6,
    7,
    7,
    8,
    8,
    9,
    9,
    10,
    10,
    11,
    11,
    12,
    12,
    13,
    13
  ]);
  var extra_blbits = new Uint8Array([
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    2,
    3,
    7
  ]);
  var bl_order = new Uint8Array([
    16,
    17,
    18,
    0,
    8,
    7,
    9,
    6,
    10,
    5,
    11,
    4,
    12,
    3,
    13,
    2,
    14,
    1,
    15
  ]);
  var DIST_CODE_LEN = 512;
  var static_ltree = new Array(288 * 2);
  zero$1(static_ltree);
  var static_dtree = new Array(D_CODES * 2);
  zero$1(static_dtree);
  var _dist_code = new Array(DIST_CODE_LEN);
  zero$1(_dist_code);
  var _length_code = new Array(256);
  zero$1(_length_code);
  var base_length = new Array(LENGTH_CODES);
  zero$1(base_length);
  var base_dist = new Array(D_CODES);
  zero$1(base_dist);
  var d_code = (dist) => {
    return dist < 256 ? _dist_code[dist] : _dist_code[256 + (dist >>> 7)];
  };
  var put_short = (s, w) => {
    s.pending_buf[s.pending++] = w & 255;
    s.pending_buf[s.pending++] = w >>> 8 & 255;
  };
  var send_bits = (s, value, length) => {
    if (s.bi_valid > Buf_size - length) {
      s.bi_buf |= value << s.bi_valid & 65535;
      put_short(s, s.bi_buf);
      s.bi_buf = value >> Buf_size - s.bi_valid;
      s.bi_valid += length - Buf_size;
    } else {
      s.bi_buf |= value << s.bi_valid & 65535;
      s.bi_valid += length;
    }
  };
  var send_code = (s, c, tree) => {
    send_bits(s, tree[c * 2], tree[c * 2 + 1]);
  };
  var bi_reverse = (code, len) => {
    let res = 0;
    do {
      res |= code & 1;
      code >>>= 1;
      res <<= 1;
    } while (--len > 0);
    return res >>> 1;
  };
  var gen_bitlen = (s, desc) => {
    const tree = desc.dyn_tree;
    const max_code = desc.max_code;
    const stree = desc.stat_desc.static_tree;
    const has_stree = desc.stat_desc.has_stree;
    const extra = desc.stat_desc.extra_bits;
    const base = desc.stat_desc.extra_base;
    const max_length = desc.stat_desc.max_length;
    let h;
    let n, m;
    let bits;
    let xbits;
    let f;
    let overflow = 0;
    for (bits = 0; bits <= MAX_BITS; bits++) s.bl_count[bits] = 0;
    tree[s.heap[s.heap_max] * 2 + 1] = 0;
    for (h = s.heap_max + 1; h < HEAP_SIZE$1; h++) {
      n = s.heap[h];
      bits = tree[tree[n * 2 + 1] * 2 + 1] + 1;
      if (bits > max_length) {
        bits = max_length;
        overflow++;
      }
      tree[n * 2 + 1] = bits;
      if (n > max_code) continue;
      s.bl_count[bits]++;
      xbits = 0;
      if (n >= base) xbits = extra[n - base];
      f = tree[n * 2];
      s.opt_len += f * (bits + xbits);
      if (has_stree) s.static_len += f * (stree[n * 2 + 1] + xbits);
    }
    if (overflow === 0) return;
    do {
      bits = max_length - 1;
      while (s.bl_count[bits] === 0) bits--;
      s.bl_count[bits]--;
      s.bl_count[bits + 1] += 2;
      s.bl_count[max_length]--;
      overflow -= 2;
    } while (overflow > 0);
    for (bits = max_length; bits !== 0; bits--) {
      n = s.bl_count[bits];
      while (n !== 0) {
        m = s.heap[--h];
        if (m > max_code) continue;
        if (tree[m * 2 + 1] !== bits) {
          s.opt_len += (bits - tree[m * 2 + 1]) * tree[m * 2];
          tree[m * 2 + 1] = bits;
        }
        n--;
      }
    }
  };
  var gen_codes = (tree, max_code, bl_count) => {
    const next_code = new Array(16);
    let code = 0;
    let bits;
    let n;
    for (bits = 1; bits <= MAX_BITS; bits++) {
      code = code + bl_count[bits - 1] << 1;
      next_code[bits] = code;
    }
    for (n = 0; n <= max_code; n++) {
      let len = tree[n * 2 + 1];
      if (len === 0) continue;
      tree[n * 2] = bi_reverse(next_code[len]++, len);
    }
  };
  var init_block = (s) => {
    let n;
    for (n = 0; n < L_CODES; n++) s.dyn_ltree[n * 2] = 0;
    for (n = 0; n < D_CODES; n++) s.dyn_dtree[n * 2] = 0;
    for (n = 0; n < BL_CODES; n++) s.bl_tree[n * 2] = 0;
    s.dyn_ltree[END_BLOCK * 2] = 1;
    s.opt_len = s.static_len = 0;
    s.sym_next = s.matches = 0;
  };
  var bi_windup = (s) => {
    if (s.bi_valid > 8) put_short(s, s.bi_buf);
    else if (s.bi_valid > 0) s.pending_buf[s.pending++] = s.bi_buf;
    s.bi_buf = 0;
    s.bi_valid = 0;
  };
  var smaller = (tree, n, m, depth) => {
    const _n2 = n * 2;
    const _m2 = m * 2;
    return tree[_n2] < tree[_m2] || tree[_n2] === tree[_m2] && depth[n] <= depth[m];
  };
  var pqdownheap = (s, tree, k) => {
    const v = s.heap[k];
    let j = k << 1;
    while (j <= s.heap_len) {
      if (j < s.heap_len && smaller(tree, s.heap[j + 1], s.heap[j], s.depth)) j++;
      if (smaller(tree, v, s.heap[j], s.depth)) break;
      s.heap[k] = s.heap[j];
      k = j;
      j <<= 1;
    }
    s.heap[k] = v;
  };
  var compress_block = (s, ltree, dtree) => {
    let dist;
    let lc;
    let sx = 0;
    let code;
    let extra;
    if (s.sym_next !== 0) do {
      dist = s.pending_buf[s.sym_buf + sx++] & 255;
      dist += (s.pending_buf[s.sym_buf + sx++] & 255) << 8;
      lc = s.pending_buf[s.sym_buf + sx++];
      if (dist === 0) send_code(s, lc, ltree);
      else {
        code = _length_code[lc];
        send_code(s, code + LITERALS + 1, ltree);
        extra = extra_lbits[code];
        if (extra !== 0) {
          lc -= base_length[code];
          send_bits(s, lc, extra);
        }
        dist--;
        code = d_code(dist);
        send_code(s, code, dtree);
        extra = extra_dbits[code];
        if (extra !== 0) {
          dist -= base_dist[code];
          send_bits(s, dist, extra);
        }
      }
    } while (sx < s.sym_next);
    send_code(s, END_BLOCK, ltree);
  };
  var build_tree = (s, desc) => {
    const tree = desc.dyn_tree;
    const stree = desc.stat_desc.static_tree;
    const has_stree = desc.stat_desc.has_stree;
    const elems = desc.stat_desc.elems;
    let n, m;
    let max_code = -1;
    let node;
    s.heap_len = 0;
    s.heap_max = HEAP_SIZE$1;
    for (n = 0; n < elems; n++) if (tree[n * 2] !== 0) {
      s.heap[++s.heap_len] = max_code = n;
      s.depth[n] = 0;
    } else tree[n * 2 + 1] = 0;
    while (s.heap_len < 2) {
      node = s.heap[++s.heap_len] = max_code < 2 ? ++max_code : 0;
      tree[node * 2] = 1;
      s.depth[node] = 0;
      s.opt_len--;
      if (has_stree) s.static_len -= stree[node * 2 + 1];
    }
    desc.max_code = max_code;
    for (n = s.heap_len >> 1; n >= 1; n--) pqdownheap(s, tree, n);
    node = elems;
    do {
      n = s.heap[1];
      s.heap[1] = s.heap[s.heap_len--];
      pqdownheap(s, tree, 1);
      m = s.heap[1];
      s.heap[--s.heap_max] = n;
      s.heap[--s.heap_max] = m;
      tree[node * 2] = tree[n * 2] + tree[m * 2];
      s.depth[node] = (s.depth[n] >= s.depth[m] ? s.depth[n] : s.depth[m]) + 1;
      tree[n * 2 + 1] = tree[m * 2 + 1] = node;
      s.heap[1] = node++;
      pqdownheap(s, tree, 1);
    } while (s.heap_len >= 2);
    s.heap[--s.heap_max] = s.heap[1];
    gen_bitlen(s, desc);
    gen_codes(tree, max_code, s.bl_count);
  };
  var scan_tree = (s, tree, max_code) => {
    let n;
    let prevlen = -1;
    let curlen;
    let nextlen = tree[1];
    let count = 0;
    let max_count = 7;
    let min_count = 4;
    if (nextlen === 0) {
      max_count = 138;
      min_count = 3;
    }
    tree[(max_code + 1) * 2 + 1] = 65535;
    for (n = 0; n <= max_code; n++) {
      curlen = nextlen;
      nextlen = tree[(n + 1) * 2 + 1];
      if (++count < max_count && curlen === nextlen) continue;
      else if (count < min_count) s.bl_tree[curlen * 2] += count;
      else if (curlen !== 0) {
        if (curlen !== prevlen) s.bl_tree[curlen * 2]++;
        s.bl_tree[REP_3_6 * 2]++;
      } else if (count <= 10) s.bl_tree[REPZ_3_10 * 2]++;
      else s.bl_tree[REPZ_11_138 * 2]++;
      count = 0;
      prevlen = curlen;
      if (nextlen === 0) {
        max_count = 138;
        min_count = 3;
      } else if (curlen === nextlen) {
        max_count = 6;
        min_count = 3;
      } else {
        max_count = 7;
        min_count = 4;
      }
    }
  };
  var send_tree = (s, tree, max_code) => {
    let n;
    let prevlen = -1;
    let curlen;
    let nextlen = tree[1];
    let count = 0;
    let max_count = 7;
    let min_count = 4;
    if (nextlen === 0) {
      max_count = 138;
      min_count = 3;
    }
    for (n = 0; n <= max_code; n++) {
      curlen = nextlen;
      nextlen = tree[(n + 1) * 2 + 1];
      if (++count < max_count && curlen === nextlen) continue;
      else if (count < min_count) do
        send_code(s, curlen, s.bl_tree);
      while (--count !== 0);
      else if (curlen !== 0) {
        if (curlen !== prevlen) {
          send_code(s, curlen, s.bl_tree);
          count--;
        }
        send_code(s, REP_3_6, s.bl_tree);
        send_bits(s, count - 3, 2);
      } else if (count <= 10) {
        send_code(s, REPZ_3_10, s.bl_tree);
        send_bits(s, count - 3, 3);
      } else {
        send_code(s, REPZ_11_138, s.bl_tree);
        send_bits(s, count - 11, 7);
      }
      count = 0;
      prevlen = curlen;
      if (nextlen === 0) {
        max_count = 138;
        min_count = 3;
      } else if (curlen === nextlen) {
        max_count = 6;
        min_count = 3;
      } else {
        max_count = 7;
        min_count = 4;
      }
    }
  };
  var build_bl_tree = (s) => {
    let max_blindex;
    scan_tree(s, s.dyn_ltree, s.l_desc.max_code);
    scan_tree(s, s.dyn_dtree, s.d_desc.max_code);
    build_tree(s, s.bl_desc);
    for (max_blindex = BL_CODES - 1; max_blindex >= 3; max_blindex--) if (s.bl_tree[bl_order[max_blindex] * 2 + 1] !== 0) break;
    s.opt_len += 3 * (max_blindex + 1) + 5 + 5 + 4;
    return max_blindex;
  };
  var send_all_trees = (s, lcodes, dcodes, blcodes) => {
    let rank;
    send_bits(s, lcodes - 257, 5);
    send_bits(s, dcodes - 1, 5);
    send_bits(s, blcodes - 4, 4);
    for (rank = 0; rank < blcodes; rank++) send_bits(s, s.bl_tree[bl_order[rank] * 2 + 1], 3);
    send_tree(s, s.dyn_ltree, lcodes - 1);
    send_tree(s, s.dyn_dtree, dcodes - 1);
  };
  var detect_data_type = (s) => {
    let block_mask = 4093624447;
    let n;
    for (n = 0; n <= 31; n++, block_mask >>>= 1) if (block_mask & 1 && s.dyn_ltree[n * 2] !== 0) return Z_BINARY;
    if (s.dyn_ltree[18] !== 0 || s.dyn_ltree[20] !== 0 || s.dyn_ltree[26] !== 0) return Z_TEXT;
    for (n = 32; n < LITERALS; n++) if (s.dyn_ltree[n * 2] !== 0) return Z_TEXT;
    return Z_BINARY;
  };
  var _tr_stored_block = (s, buf, stored_len, last) => {
    send_bits(s, (STORED_BLOCK << 1) + (last ? 1 : 0), 3);
    bi_windup(s);
    put_short(s, stored_len);
    put_short(s, ~stored_len);
    if (stored_len) s.pending_buf.set(s.window.subarray(buf, buf + stored_len), s.pending);
    s.pending += stored_len;
  };
  var _tr_flush_block = (s, buf, stored_len, last) => {
    let opt_lenb, static_lenb;
    let max_blindex = 0;
    if (s.level > 0) {
      if (s.strm.data_type === Z_UNKNOWN) s.strm.data_type = detect_data_type(s);
      build_tree(s, s.l_desc);
      build_tree(s, s.d_desc);
      max_blindex = build_bl_tree(s);
      opt_lenb = s.opt_len + 3 + 7 >>> 3;
      static_lenb = s.static_len + 3 + 7 >>> 3;
      if (static_lenb <= opt_lenb) opt_lenb = static_lenb;
    } else opt_lenb = static_lenb = stored_len + 5;
    if (stored_len + 4 <= opt_lenb && buf !== -1) _tr_stored_block(s, buf, stored_len, last);
    else if (s.strategy === Z_FIXED || static_lenb === opt_lenb) {
      send_bits(s, (STATIC_TREES << 1) + (last ? 1 : 0), 3);
      compress_block(s, static_ltree, static_dtree);
    } else {
      send_bits(s, (DYN_TREES << 1) + (last ? 1 : 0), 3);
      send_all_trees(s, s.l_desc.max_code + 1, s.d_desc.max_code + 1, max_blindex + 1);
      compress_block(s, s.dyn_ltree, s.dyn_dtree);
    }
    init_block(s);
    if (last) bi_windup(s);
  };
  var _tr_tally = (s, dist, lc) => {
    s.pending_buf[s.sym_buf + s.sym_next++] = dist;
    s.pending_buf[s.sym_buf + s.sym_next++] = dist >> 8;
    s.pending_buf[s.sym_buf + s.sym_next++] = lc;
    if (dist === 0) s.dyn_ltree[lc * 2]++;
    else {
      s.matches++;
      dist--;
      s.dyn_ltree[(_length_code[lc] + LITERALS + 1) * 2]++;
      s.dyn_dtree[d_code(dist) * 2]++;
    }
    return s.sym_next === s.sym_end;
  };
  var adler32 = (adler, buf, len, pos) => {
    let s1 = adler & 65535 | 0, s2 = adler >>> 16 & 65535 | 0, n = 0;
    while (len !== 0) {
      n = len > 2e3 ? 2e3 : len;
      len -= n;
      do {
        s1 = s1 + buf[pos++] | 0;
        s2 = s2 + s1 | 0;
      } while (--n);
      s1 %= 65521;
      s2 %= 65521;
    }
    return s1 | s2 << 16 | 0;
  };
  var makeTable = () => {
    let c, table = [];
    for (var n = 0; n < 256; n++) {
      c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
      table[n] = c;
    }
    return table;
  };
  var crcTable = new Uint32Array(makeTable());
  var crc32 = (crc, buf, len, pos) => {
    const t = crcTable;
    const end = pos + len;
    crc ^= -1;
    for (let i = pos; i < end; i++) crc = crc >>> 8 ^ t[(crc ^ buf[i]) & 255];
    return crc ^ -1;
  };
  var messages_default = {
    2: "need dictionary",
    1: "stream end",
    0: "",
    "-1": "file error",
    "-2": "stream error",
    "-3": "data error",
    "-4": "insufficient memory",
    "-5": "buffer error",
    "-6": "incompatible version"
  };
  var MIN_MATCH = 3;
  var MAX_MATCH = 258;
  var MIN_LOOKAHEAD = 262;
  var BS_NEED_MORE = 1;
  var BS_BLOCK_DONE = 2;
  var BS_FINISH_STARTED = 3;
  var BS_FINISH_DONE = 4;
  var slide_hash = (s) => {
    let n, m;
    let p;
    let wsize = s.w_size;
    n = s.hash_size;
    p = n;
    do {
      m = s.head[--p];
      s.head[p] = m >= wsize ? m - wsize : 0;
    } while (--n);
    n = wsize;
    p = n;
    do {
      m = s.prev[--p];
      s.prev[p] = m >= wsize ? m - wsize : 0;
    } while (--n);
  };
  var HASH = (s, prev, data) => (prev << s.hash_shift ^ data) & s.hash_mask;
  var INSERT_STRING = (s, str) => {
    let h;
    if (s.legacy_hash) h = s.ins_h = HASH(s, s.ins_h, s.window[str + MIN_MATCH - 1]);
    else {
      const w = s.window;
      const value = w[str] | w[str + 1] << 8 | w[str + 2] << 16 | w[str + 3] << 24;
      h = s.ins_h = Math.imul(value, 66521) + 66521 >>> 16 & s.hash_mask;
    }
    const hash_head = s.prev[str & s.w_mask] = s.head[h];
    s.head[h] = str;
    return hash_head;
  };
  var flush_pending = (strm) => {
    const s = strm.state;
    let len = s.pending;
    if (len > strm.avail_out) len = strm.avail_out;
    if (len === 0) return;
    strm.output.set(s.pending_buf.subarray(s.pending_out, s.pending_out + len), strm.next_out);
    strm.next_out += len;
    s.pending_out += len;
    strm.total_out += len;
    strm.avail_out -= len;
    s.pending -= len;
    if (s.pending === 0) s.pending_out = 0;
  };
  var flush_block_only = (s, last) => {
    _tr_flush_block(s, s.block_start >= 0 ? s.block_start : -1, s.strstart - s.block_start, last);
    s.block_start = s.strstart;
    flush_pending(s.strm);
  };
  var read_buf = (strm, buf, start, size) => {
    let len = strm.avail_in;
    if (len > size) len = size;
    if (len === 0) return 0;
    strm.avail_in -= len;
    buf.set(strm.input.subarray(strm.next_in, strm.next_in + len), start);
    if (strm.state.wrap === 1) strm.adler = adler32(strm.adler, buf, len, start);
    else if (strm.state.wrap === 2) strm.adler = crc32(strm.adler, buf, len, start);
    strm.next_in += len;
    strm.total_in += len;
    return len;
  };
  var longest_match = (s, cur_match) => {
    let chain_length = s.max_chain_length;
    let scan = s.strstart;
    let match;
    let len;
    let best_len = s.prev_length;
    let nice_match = s.nice_match;
    const limit = s.strstart > s.w_size - MIN_LOOKAHEAD ? s.strstart - (s.w_size - MIN_LOOKAHEAD) : 0;
    const _win = s.window;
    const wmask = s.w_mask;
    const prev = s.prev;
    const strend = s.strstart + MAX_MATCH;
    let scan_end1 = _win[scan + best_len - 1];
    let scan_end = _win[scan + best_len];
    if (s.prev_length >= s.good_match) chain_length >>= 2;
    if (nice_match > s.lookahead) nice_match = s.lookahead;
    do {
      match = cur_match;
      if (_win[match + best_len] !== scan_end || _win[match + best_len - 1] !== scan_end1 || _win[match] !== _win[scan] || _win[++match] !== _win[scan + 1]) continue;
      scan += 2;
      match++;
      do
        ;
      while (_win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && scan < strend);
      len = MAX_MATCH - (strend - scan);
      scan = strend - MAX_MATCH;
      if (len > best_len) {
        s.match_start = cur_match;
        best_len = len;
        if (len >= nice_match) break;
        scan_end1 = _win[scan + best_len - 1];
        scan_end = _win[scan + best_len];
      }
    } while ((cur_match = prev[cur_match & wmask]) > limit && --chain_length !== 0);
    if (best_len <= s.lookahead) return best_len;
    return s.lookahead;
  };
  var fill_window = (s) => {
    const _w_size = s.w_size;
    let n, more, str;
    do {
      more = s.window_size - s.lookahead - s.strstart;
      if (s.strstart >= _w_size + (_w_size - MIN_LOOKAHEAD)) {
        s.window.set(s.window.subarray(_w_size, _w_size + _w_size - more), 0);
        s.match_start -= _w_size;
        s.strstart -= _w_size;
        s.block_start -= _w_size;
        if (s.insert > s.strstart) s.insert = s.strstart;
        slide_hash(s);
        more += _w_size;
      }
      if (s.strm.avail_in === 0) break;
      n = read_buf(s.strm, s.window, s.strstart + s.lookahead, more);
      s.lookahead += n;
      if (!s.legacy_hash) {
        if (s.lookahead + s.insert > MIN_MATCH) {
          str = s.strstart - s.insert;
          while (s.insert) {
            INSERT_STRING(s, str);
            str++;
            s.insert--;
            if (s.lookahead + s.insert <= MIN_MATCH) break;
          }
        }
      } else if (s.lookahead + s.insert >= MIN_MATCH) {
        str = s.strstart - s.insert;
        s.ins_h = s.window[str];
        s.ins_h = HASH(s, s.ins_h, s.window[str + 1]);
        while (s.insert) {
          INSERT_STRING(s, str);
          str++;
          s.insert--;
          if (s.lookahead + s.insert < MIN_MATCH) break;
        }
      }
    } while (s.lookahead < MIN_LOOKAHEAD && s.strm.avail_in !== 0);
  };
  var deflate_stored = (s, flush) => {
    let min_block = s.pending_buf_size - 5 > s.w_size ? s.w_size : s.pending_buf_size - 5;
    let len, left, have, last = 0;
    let used = s.strm.avail_in;
    do {
      len = 65535;
      have = s.bi_valid + 42 >> 3;
      if (s.strm.avail_out < have) break;
      have = s.strm.avail_out - have;
      left = s.strstart - s.block_start;
      if (len > left + s.strm.avail_in) len = left + s.strm.avail_in;
      if (len > have) len = have;
      if (len < min_block && (len === 0 && flush !== 4 || flush === 0 || len !== left + s.strm.avail_in)) break;
      last = flush === 4 && len === left + s.strm.avail_in ? 1 : 0;
      _tr_stored_block(s, 0, 0, last);
      s.pending_buf[s.pending - 4] = len;
      s.pending_buf[s.pending - 3] = len >> 8;
      s.pending_buf[s.pending - 2] = ~len;
      s.pending_buf[s.pending - 1] = ~len >> 8;
      flush_pending(s.strm);
      if (left) {
        if (left > len) left = len;
        s.strm.output.set(s.window.subarray(s.block_start, s.block_start + left), s.strm.next_out);
        s.strm.next_out += left;
        s.strm.avail_out -= left;
        s.strm.total_out += left;
        s.block_start += left;
        len -= left;
      }
      if (len) {
        read_buf(s.strm, s.strm.output, s.strm.next_out, len);
        s.strm.next_out += len;
        s.strm.avail_out -= len;
        s.strm.total_out += len;
      }
    } while (last === 0);
    used -= s.strm.avail_in;
    if (used) {
      if (used >= s.w_size) {
        s.matches = 2;
        s.window.set(s.strm.input.subarray(s.strm.next_in - s.w_size, s.strm.next_in), 0);
        s.strstart = s.w_size;
        s.insert = s.strstart;
      } else {
        if (s.window_size - s.strstart <= used) {
          s.strstart -= s.w_size;
          s.window.set(s.window.subarray(s.w_size, s.w_size + s.strstart), 0);
          if (s.matches < 2) s.matches++;
          if (s.insert > s.strstart) s.insert = s.strstart;
        }
        s.window.set(s.strm.input.subarray(s.strm.next_in - used, s.strm.next_in), s.strstart);
        s.strstart += used;
        s.insert += used > s.w_size - s.insert ? s.w_size - s.insert : used;
      }
      s.block_start = s.strstart;
    }
    if (s.high_water < s.strstart) s.high_water = s.strstart;
    if (last) return BS_FINISH_DONE;
    if (flush !== 0 && flush !== 4 && s.strm.avail_in === 0 && s.strstart === s.block_start) return BS_BLOCK_DONE;
    have = s.window_size - s.strstart;
    if (s.strm.avail_in > have && s.block_start >= s.w_size) {
      s.block_start -= s.w_size;
      s.strstart -= s.w_size;
      s.window.set(s.window.subarray(s.w_size, s.w_size + s.strstart), 0);
      if (s.matches < 2) s.matches++;
      have += s.w_size;
      if (s.insert > s.strstart) s.insert = s.strstart;
    }
    if (have > s.strm.avail_in) have = s.strm.avail_in;
    if (have) {
      read_buf(s.strm, s.window, s.strstart, have);
      s.strstart += have;
      s.insert += have > s.w_size - s.insert ? s.w_size - s.insert : have;
    }
    if (s.high_water < s.strstart) s.high_water = s.strstart;
    have = s.bi_valid + 42 >> 3;
    have = s.pending_buf_size - have > 65535 ? 65535 : s.pending_buf_size - have;
    min_block = have > s.w_size ? s.w_size : have;
    left = s.strstart - s.block_start;
    if (left >= min_block || (left || flush === 4) && flush !== 0 && s.strm.avail_in === 0 && left <= have) {
      len = left > have ? have : left;
      last = flush === 4 && s.strm.avail_in === 0 && len === left ? 1 : 0;
      _tr_stored_block(s, s.block_start, len, last);
      s.block_start += len;
      flush_pending(s.strm);
    }
    return last ? BS_FINISH_STARTED : BS_NEED_MORE;
  };
  var deflate_fast = (s, flush) => {
    let hash_head;
    let bflush;
    for (; ; ) {
      if (s.lookahead < MIN_LOOKAHEAD) {
        fill_window(s);
        if (s.lookahead < MIN_LOOKAHEAD && flush === 0) return BS_NEED_MORE;
        if (s.lookahead === 0) break;
      }
      hash_head = 0;
      if (s.lookahead >= MIN_MATCH) hash_head = INSERT_STRING(s, s.strstart);
      if (hash_head !== 0 && s.strstart - hash_head <= s.w_size - MIN_LOOKAHEAD) s.match_length = longest_match(s, hash_head);
      if (s.match_length >= MIN_MATCH) {
        bflush = _tr_tally(s, s.strstart - s.match_start, s.match_length - MIN_MATCH);
        s.lookahead -= s.match_length;
        if (s.match_length <= s.max_lazy_match && s.lookahead >= MIN_MATCH) {
          s.match_length--;
          do {
            s.strstart++;
            hash_head = INSERT_STRING(s, s.strstart);
          } while (--s.match_length !== 0);
          s.strstart++;
        } else {
          s.strstart += s.match_length;
          s.match_length = 0;
          if (s.legacy_hash) {
            s.ins_h = s.window[s.strstart];
            s.ins_h = HASH(s, s.ins_h, s.window[s.strstart + 1]);
          }
        }
      } else {
        bflush = _tr_tally(s, 0, s.window[s.strstart]);
        s.lookahead--;
        s.strstart++;
      }
      if (bflush) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) return BS_NEED_MORE;
      }
    }
    s.insert = s.strstart < MIN_MATCH - 1 ? s.strstart : MIN_MATCH - 1;
    if (flush === 4) {
      flush_block_only(s, true);
      if (s.strm.avail_out === 0) return BS_FINISH_STARTED;
      return BS_FINISH_DONE;
    }
    if (s.sym_next) {
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) return BS_NEED_MORE;
    }
    return BS_BLOCK_DONE;
  };
  var deflate_slow = (s, flush) => {
    let hash_head;
    let bflush;
    let max_insert;
    for (; ; ) {
      if (s.lookahead < MIN_LOOKAHEAD) {
        fill_window(s);
        if (s.lookahead < MIN_LOOKAHEAD && flush === 0) return BS_NEED_MORE;
        if (s.lookahead === 0) break;
      }
      hash_head = 0;
      if (s.lookahead >= MIN_MATCH) hash_head = INSERT_STRING(s, s.strstart);
      s.prev_length = s.match_length;
      s.prev_match = s.match_start;
      s.match_length = MIN_MATCH - 1;
      if (hash_head !== 0 && s.prev_length < s.max_lazy_match && s.strstart - hash_head <= s.w_size - MIN_LOOKAHEAD) {
        s.match_length = longest_match(s, hash_head);
        if (s.match_length <= 5 && (s.strategy === 1 || s.match_length === MIN_MATCH && s.strstart - s.match_start > 4096)) s.match_length = MIN_MATCH - 1;
      }
      if (s.prev_length >= MIN_MATCH && s.match_length <= s.prev_length) {
        max_insert = s.strstart + s.lookahead - MIN_MATCH;
        bflush = _tr_tally(s, s.strstart - 1 - s.prev_match, s.prev_length - MIN_MATCH);
        s.lookahead -= s.prev_length - 1;
        s.prev_length -= 2;
        do
          if (++s.strstart <= max_insert) hash_head = INSERT_STRING(s, s.strstart);
        while (--s.prev_length !== 0);
        s.match_available = 0;
        s.match_length = MIN_MATCH - 1;
        s.strstart++;
        if (bflush) {
          flush_block_only(s, false);
          if (s.strm.avail_out === 0) return BS_NEED_MORE;
        }
      } else if (s.match_available) {
        bflush = _tr_tally(s, 0, s.window[s.strstart - 1]);
        if (bflush)
          flush_block_only(s, false);
        s.strstart++;
        s.lookahead--;
        if (s.strm.avail_out === 0) return BS_NEED_MORE;
      } else {
        s.match_available = 1;
        s.strstart++;
        s.lookahead--;
      }
    }
    if (s.match_available) {
      bflush = _tr_tally(s, 0, s.window[s.strstart - 1]);
      s.match_available = 0;
    }
    s.insert = s.strstart < MIN_MATCH - 1 ? s.strstart : MIN_MATCH - 1;
    if (flush === 4) {
      flush_block_only(s, true);
      if (s.strm.avail_out === 0) return BS_FINISH_STARTED;
      return BS_FINISH_DONE;
    }
    if (s.sym_next) {
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) return BS_NEED_MORE;
    }
    return BS_BLOCK_DONE;
  };
  var Config = class {
    constructor(good_length, max_lazy, nice_length, max_chain, func) {
      this.good_length = good_length;
      this.max_lazy = max_lazy;
      this.nice_length = nice_length;
      this.max_chain = max_chain;
      this.func = func;
    }
  };
  var configuration_table = [
    new Config(0, 0, 0, 0, deflate_stored),
    new Config(4, 4, 8, 4, deflate_fast),
    new Config(4, 5, 16, 8, deflate_fast),
    new Config(4, 6, 32, 32, deflate_fast),
    new Config(4, 4, 16, 16, deflate_slow),
    new Config(8, 16, 32, 32, deflate_slow),
    new Config(8, 16, 128, 128, deflate_slow),
    new Config(8, 32, 128, 256, deflate_slow),
    new Config(32, 128, 258, 1024, deflate_slow),
    new Config(32, 258, 258, 4096, deflate_slow)
  ];
  var BAD$1 = 16209;
  var TYPE$1 = 16191;
  function inflate_fast(strm, start) {
    let _in;
    let last;
    let _out;
    let beg;
    let end;
    let dmax;
    let wsize;
    let whave;
    let wnext;
    let s_window;
    let hold;
    let bits;
    let lcode;
    let dcode;
    let lmask;
    let dmask;
    let here;
    let op;
    let len;
    let dist;
    let from;
    let from_source;
    let input, output;
    const state = strm.state;
    _in = strm.next_in;
    input = strm.input;
    last = _in + (strm.avail_in - 5);
    _out = strm.next_out;
    output = strm.output;
    beg = _out - (start - strm.avail_out);
    end = _out + (strm.avail_out - 257);
    dmax = state.dmax;
    wsize = state.wsize;
    whave = state.whave;
    wnext = state.wnext;
    s_window = state.window;
    hold = state.hold;
    bits = state.bits;
    lcode = state.lencode;
    dcode = state.distcode;
    lmask = (1 << state.lenbits) - 1;
    dmask = (1 << state.distbits) - 1;
    top: do {
      if (bits < 15) {
        hold += input[_in++] << bits;
        bits += 8;
        hold += input[_in++] << bits;
        bits += 8;
      }
      here = lcode[hold & lmask];
      dolen: for (; ; ) {
        op = here >>> 24;
        hold >>>= op;
        bits -= op;
        op = here >>> 16 & 255;
        if (op === 0) output[_out++] = here & 65535;
        else if (op & 16) {
          len = here & 65535;
          op &= 15;
          if (op) {
            if (bits < op) {
              hold += input[_in++] << bits;
              bits += 8;
            }
            len += hold & (1 << op) - 1;
            hold >>>= op;
            bits -= op;
          }
          if (bits < 15) {
            hold += input[_in++] << bits;
            bits += 8;
            hold += input[_in++] << bits;
            bits += 8;
          }
          here = dcode[hold & dmask];
          dodist: for (; ; ) {
            op = here >>> 24;
            hold >>>= op;
            bits -= op;
            op = here >>> 16 & 255;
            if (op & 16) {
              dist = here & 65535;
              op &= 15;
              if (bits < op) {
                hold += input[_in++] << bits;
                bits += 8;
                if (bits < op) {
                  hold += input[_in++] << bits;
                  bits += 8;
                }
              }
              dist += hold & (1 << op) - 1;
              if (dist > dmax) {
                strm.msg = "invalid distance too far back";
                state.mode = BAD$1;
                break top;
              }
              hold >>>= op;
              bits -= op;
              op = _out - beg;
              if (dist > op) {
                op = dist - op;
                if (op > whave) {
                  if (state.sane) {
                    strm.msg = "invalid distance too far back";
                    state.mode = BAD$1;
                    break top;
                  }
                }
                from = 0;
                from_source = s_window;
                if (wnext === 0) {
                  from += wsize - op;
                  if (op < len) {
                    len -= op;
                    do
                      output[_out++] = s_window[from++];
                    while (--op);
                    from = _out - dist;
                    from_source = output;
                  }
                } else if (wnext < op) {
                  from += wsize + wnext - op;
                  op -= wnext;
                  if (op < len) {
                    len -= op;
                    do
                      output[_out++] = s_window[from++];
                    while (--op);
                    from = 0;
                    if (wnext < len) {
                      op = wnext;
                      len -= op;
                      do
                        output[_out++] = s_window[from++];
                      while (--op);
                      from = _out - dist;
                      from_source = output;
                    }
                  }
                } else {
                  from += wnext - op;
                  if (op < len) {
                    len -= op;
                    do
                      output[_out++] = s_window[from++];
                    while (--op);
                    from = _out - dist;
                    from_source = output;
                  }
                }
                while (len > 2) {
                  output[_out++] = from_source[from++];
                  output[_out++] = from_source[from++];
                  output[_out++] = from_source[from++];
                  len -= 3;
                }
                if (len) {
                  output[_out++] = from_source[from++];
                  if (len > 1) output[_out++] = from_source[from++];
                }
              } else {
                from = _out - dist;
                do {
                  output[_out++] = output[from++];
                  output[_out++] = output[from++];
                  output[_out++] = output[from++];
                  len -= 3;
                } while (len > 2);
                if (len) {
                  output[_out++] = output[from++];
                  if (len > 1) output[_out++] = output[from++];
                }
              }
            } else if ((op & 64) === 0) {
              here = dcode[(here & 65535) + (hold & (1 << op) - 1)];
              continue dodist;
            } else {
              strm.msg = "invalid distance code";
              state.mode = BAD$1;
              break top;
            }
            break;
          }
        } else if ((op & 64) === 0) {
          here = lcode[(here & 65535) + (hold & (1 << op) - 1)];
          continue dolen;
        } else if (op & 32) {
          state.mode = TYPE$1;
          break top;
        } else {
          strm.msg = "invalid literal/length code";
          state.mode = BAD$1;
          break top;
        }
        break;
      }
    } while (_in < last && _out < end);
    len = bits >> 3;
    _in -= len;
    bits -= len << 3;
    hold &= (1 << bits) - 1;
    strm.next_in = _in;
    strm.next_out = _out;
    strm.avail_in = _in < last ? 5 + (last - _in) : 5 - (_in - last);
    strm.avail_out = _out < end ? 257 + (end - _out) : 257 - (_out - end);
    state.hold = hold;
    state.bits = bits;
  }
  var MAXBITS = 15;
  var ENOUGH_LENS$1 = 852;
  var ENOUGH_DISTS$1 = 592;
  var CODES$1 = 0;
  var LENS$1 = 1;
  var DISTS$1 = 2;
  var lbase = new Uint16Array([
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    13,
    15,
    17,
    19,
    23,
    27,
    31,
    35,
    43,
    51,
    59,
    67,
    83,
    99,
    115,
    131,
    163,
    195,
    227,
    258,
    0,
    0
  ]);
  var lext = new Uint8Array([
    16,
    16,
    16,
    16,
    16,
    16,
    16,
    16,
    17,
    17,
    17,
    17,
    18,
    18,
    18,
    18,
    19,
    19,
    19,
    19,
    20,
    20,
    20,
    20,
    21,
    21,
    21,
    21,
    16,
    199,
    75
  ]);
  var dbase = new Uint16Array([
    1,
    2,
    3,
    4,
    5,
    7,
    9,
    13,
    17,
    25,
    33,
    49,
    65,
    97,
    129,
    193,
    257,
    385,
    513,
    769,
    1025,
    1537,
    2049,
    3073,
    4097,
    6145,
    8193,
    12289,
    16385,
    24577,
    0,
    0
  ]);
  var dext = new Uint8Array([
    16,
    16,
    16,
    16,
    17,
    17,
    18,
    18,
    19,
    19,
    20,
    20,
    21,
    21,
    22,
    22,
    23,
    23,
    24,
    24,
    25,
    25,
    26,
    26,
    27,
    27,
    28,
    28,
    29,
    29,
    64,
    64
  ]);
  var inflate_table = (type, lens, lens_index, codes, table, table_index, work, opts) => {
    const bits = opts.bits;
    let len = 0;
    let sym = 0;
    let min = 0, max = 0;
    let root = 0;
    let curr = 0;
    let drop = 0;
    let left = 0;
    let used = 0;
    let huff = 0;
    let incr;
    let fill;
    let low;
    let mask;
    let next;
    let base = null;
    let match;
    const count = /* @__PURE__ */ new Uint16Array(16);
    const offs = /* @__PURE__ */ new Uint16Array(16);
    let extra = null;
    let here_bits, here_op, here_val;
    for (len = 0; len <= MAXBITS; len++) count[len] = 0;
    for (sym = 0; sym < codes; sym++) count[lens[lens_index + sym]]++;
    root = bits;
    for (max = MAXBITS; max >= 1; max--) if (count[max] !== 0) break;
    if (root > max) root = max;
    if (max === 0) {
      table[table_index++] = 20971520;
      table[table_index++] = 20971520;
      opts.bits = 1;
      return 0;
    }
    for (min = 1; min < max; min++) if (count[min] !== 0) break;
    if (root < min) root = min;
    left = 1;
    for (len = 1; len <= MAXBITS; len++) {
      left <<= 1;
      left -= count[len];
      if (left < 0) return -1;
    }
    if (left > 0 && (type === CODES$1 || max !== 1)) return -1;
    offs[1] = 0;
    for (len = 1; len < MAXBITS; len++) offs[len + 1] = offs[len] + count[len];
    for (sym = 0; sym < codes; sym++) if (lens[lens_index + sym] !== 0) work[offs[lens[lens_index + sym]]++] = sym;
    if (type === CODES$1) {
      base = extra = work;
      match = 20;
    } else if (type === LENS$1) {
      base = lbase;
      extra = lext;
      match = 257;
    } else {
      base = dbase;
      extra = dext;
      match = 0;
    }
    huff = 0;
    sym = 0;
    len = min;
    next = table_index;
    curr = root;
    drop = 0;
    low = -1;
    used = 1 << root;
    mask = used - 1;
    if (type === LENS$1 && used > ENOUGH_LENS$1 || type === DISTS$1 && used > ENOUGH_DISTS$1) return 1;
    for (; ; ) {
      here_bits = len - drop;
      if (work[sym] + 1 < match) {
        here_op = 0;
        here_val = work[sym];
      } else if (work[sym] >= match) {
        here_op = extra[work[sym] - match];
        here_val = base[work[sym] - match];
      } else {
        here_op = 96;
        here_val = 0;
      }
      incr = 1 << len - drop;
      fill = 1 << curr;
      min = fill;
      do {
        fill -= incr;
        table[next + (huff >> drop) + fill] = here_bits << 24 | here_op << 16 | here_val | 0;
      } while (fill !== 0);
      incr = 1 << len - 1;
      while (huff & incr) incr >>= 1;
      if (incr !== 0) {
        huff &= incr - 1;
        huff += incr;
      } else huff = 0;
      sym++;
      if (--count[len] === 0) {
        if (len === max) break;
        len = lens[lens_index + work[sym]];
      }
      if (len > root && (huff & mask) !== low) {
        if (drop === 0) drop = root;
        next += min;
        curr = len - drop;
        left = 1 << curr;
        while (curr + drop < max) {
          left -= count[curr + drop];
          if (left <= 0) break;
          curr++;
          left <<= 1;
        }
        used += 1 << curr;
        if (type === LENS$1 && used > ENOUGH_LENS$1 || type === DISTS$1 && used > ENOUGH_DISTS$1) return 1;
        low = huff & mask;
        table[low] = root << 24 | curr << 16 | next - table_index | 0;
      }
    }
    if (huff !== 0) table[next + huff] = len - drop << 24 | 4194304;
    opts.bits = root;
    return 0;
  };
  var CODES = 0;
  var LENS = 1;
  var DISTS = 2;
  var HEAD = 16180;
  var FLAGS = 16181;
  var TIME = 16182;
  var OS = 16183;
  var EXLEN = 16184;
  var EXTRA = 16185;
  var NAME = 16186;
  var COMMENT = 16187;
  var HCRC = 16188;
  var DICTID = 16189;
  var DICT = 16190;
  var TYPE = 16191;
  var TYPEDO = 16192;
  var STORED = 16193;
  var COPY_ = 16194;
  var COPY = 16195;
  var TABLE = 16196;
  var LENLENS = 16197;
  var CODELENS = 16198;
  var LEN_ = 16199;
  var LEN = 16200;
  var LENEXT = 16201;
  var DIST = 16202;
  var DISTEXT = 16203;
  var MATCH = 16204;
  var LIT = 16205;
  var CHECK = 16206;
  var LENGTH = 16207;
  var DONE = 16208;
  var BAD = 16209;
  var MEM = 16210;
  var SYNC = 16211;
  var ENOUGH_LENS = 852;
  var ENOUGH_DISTS = 592;
  var zswap32 = (q) => {
    return (q >>> 24 & 255) + (q >>> 8 & 65280) + ((q & 65280) << 8) + ((q & 255) << 24);
  };
  var InflateState = class {
    constructor() {
      this.strm = null;
      this.mode = 0;
      this.last = false;
      this.wrap = 0;
      this.havedict = false;
      this.flags = 0;
      this.dmax = 0;
      this.check = 0;
      this.total = 0;
      this.head = null;
      this.wbits = 0;
      this.wsize = 0;
      this.whave = 0;
      this.wnext = 0;
      this.window = null;
      this.hold = 0;
      this.bits = 0;
      this.length = 0;
      this.offset = 0;
      this.extra = 0;
      this.lencode = null;
      this.distcode = null;
      this.lenbits = 0;
      this.distbits = 0;
      this.ncode = 0;
      this.nlen = 0;
      this.ndist = 0;
      this.have = 0;
      this.next = null;
      this.lens = /* @__PURE__ */ new Uint16Array(320);
      this.work = /* @__PURE__ */ new Uint16Array(288);
      this.lendyn = null;
      this.distdyn = null;
      this.sane = 0;
      this.back = 0;
      this.was = 0;
    }
  };
  var inflateStateCheck = (strm) => {
    if (!strm) return 1;
    const state = strm.state;
    if (!state || state.strm !== strm || state.mode < HEAD || state.mode > SYNC) return 1;
    return 0;
  };
  var inflateResetKeep = (strm) => {
    if (inflateStateCheck(strm)) return -2;
    const state = strm.state;
    strm.total_in = strm.total_out = state.total = 0;
    strm.msg = "";
    if (state.wrap) strm.adler = state.wrap & 1;
    state.mode = HEAD;
    state.last = 0;
    state.havedict = 0;
    state.flags = -1;
    state.dmax = 32768;
    state.head = null;
    state.hold = 0;
    state.bits = 0;
    state.lencode = state.lendyn = new Int32Array(ENOUGH_LENS);
    state.distcode = state.distdyn = new Int32Array(ENOUGH_DISTS);
    state.sane = 1;
    state.back = -1;
    return 0;
  };
  var inflateReset = (strm) => {
    if (inflateStateCheck(strm)) return -2;
    const state = strm.state;
    state.wsize = 0;
    state.whave = 0;
    state.wnext = 0;
    return inflateResetKeep(strm);
  };
  var inflateReset2 = (strm, windowBits) => {
    let wrap;
    if (inflateStateCheck(strm)) return -2;
    const state = strm.state;
    if (windowBits < 0) {
      wrap = 0;
      windowBits = -windowBits;
    } else {
      wrap = (windowBits >> 4) + 5;
      if (windowBits < 48) windowBits &= 15;
    }
    if (windowBits && (windowBits < 8 || windowBits > 15)) return -2;
    if (state.window !== null && state.wbits !== windowBits) state.window = null;
    state.wrap = wrap;
    state.wbits = windowBits;
    return inflateReset(strm);
  };
  var inflateInit2 = (strm, windowBits) => {
    if (!strm) return -2;
    const state = new InflateState();
    strm.state = state;
    state.strm = strm;
    state.window = null;
    state.mode = HEAD;
    const ret = inflateReset2(strm, windowBits);
    if (ret !== 0) strm.state = null;
    return ret;
  };
  var virgin = true;
  var lenfix;
  var distfix;
  var fixedtables = (state) => {
    if (virgin) {
      lenfix = /* @__PURE__ */ new Int32Array(512);
      distfix = /* @__PURE__ */ new Int32Array(32);
      let sym = 0;
      while (sym < 144) state.lens[sym++] = 8;
      while (sym < 256) state.lens[sym++] = 9;
      while (sym < 280) state.lens[sym++] = 7;
      while (sym < 288) state.lens[sym++] = 8;
      inflate_table(LENS, state.lens, 0, 288, lenfix, 0, state.work, { bits: 9 });
      sym = 0;
      while (sym < 32) state.lens[sym++] = 5;
      inflate_table(DISTS, state.lens, 0, 32, distfix, 0, state.work, { bits: 5 });
      virgin = false;
    }
    state.lencode = lenfix;
    state.lenbits = 9;
    state.distcode = distfix;
    state.distbits = 5;
  };
  var updatewindow = (strm, src, end, copy) => {
    let dist;
    const state = strm.state;
    if (state.window === null) state.window = new Uint8Array(1 << state.wbits);
    if (state.wsize === 0) {
      state.wsize = 1 << state.wbits;
      state.wnext = 0;
      state.whave = 0;
    }
    if (copy >= state.wsize) {
      state.window.set(src.subarray(end - state.wsize, end), 0);
      state.wnext = 0;
      state.whave = state.wsize;
    } else {
      dist = state.wsize - state.wnext;
      if (dist > copy) dist = copy;
      state.window.set(src.subarray(end - copy, end - copy + dist), state.wnext);
      copy -= dist;
      if (copy) {
        state.window.set(src.subarray(end - copy, end), 0);
        state.wnext = copy;
        state.whave = state.wsize;
      } else {
        state.wnext += dist;
        if (state.wnext === state.wsize) state.wnext = 0;
        if (state.whave < state.wsize) state.whave += dist;
      }
    }
    return 0;
  };
  var inflate$1 = (strm, flush) => {
    let state;
    let input, output;
    let next;
    let put;
    let have, left;
    let hold;
    let bits;
    let _in, _out;
    let copy;
    let from;
    let from_source;
    let here = 0;
    let here_bits, here_op, here_val;
    let last_bits, last_op, last_val;
    let len;
    let ret;
    const hbuf = /* @__PURE__ */ new Uint8Array(4);
    let opts;
    let n;
    const order = new Uint8Array([
      16,
      17,
      18,
      0,
      8,
      7,
      9,
      6,
      10,
      5,
      11,
      4,
      12,
      3,
      13,
      2,
      14,
      1,
      15
    ]);
    if (inflateStateCheck(strm) || !strm.output || !strm.input && strm.avail_in !== 0) return -2;
    state = strm.state;
    if (state.mode === TYPE) state.mode = TYPEDO;
    put = strm.next_out;
    output = strm.output;
    left = strm.avail_out;
    next = strm.next_in;
    input = strm.input;
    have = strm.avail_in;
    hold = state.hold;
    bits = state.bits;
    _in = have;
    _out = left;
    ret = 0;
    inf_leave: for (; ; ) switch (state.mode) {
      case HEAD:
        if (state.wrap === 0) {
          state.mode = TYPEDO;
          break;
        }
        while (bits < 16) {
          if (have === 0) break inf_leave;
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        if (state.wrap & 2 && hold === 35615) {
          if (state.wbits === 0) state.wbits = 15;
          state.check = 0;
          hbuf[0] = hold & 255;
          hbuf[1] = hold >>> 8 & 255;
          state.check = crc32(state.check, hbuf, 2, 0);
          hold = 0;
          bits = 0;
          state.mode = FLAGS;
          break;
        }
        if (state.head) state.head.done = false;
        if (!(state.wrap & 1) || (((hold & 255) << 8) + (hold >> 8)) % 31) {
          strm.msg = "incorrect header check";
          state.mode = BAD;
          break;
        }
        if ((hold & 15) !== 8) {
          strm.msg = "unknown compression method";
          state.mode = BAD;
          break;
        }
        hold >>>= 4;
        bits -= 4;
        len = (hold & 15) + 8;
        if (state.wbits === 0) state.wbits = len;
        if (len > 15 || len > state.wbits) {
          strm.msg = "invalid window size";
          state.mode = BAD;
          break;
        }
        state.dmax = 1 << state.wbits;
        state.flags = 0;
        strm.adler = state.check = 1;
        state.mode = hold & 512 ? DICTID : TYPE;
        hold = 0;
        bits = 0;
        break;
      case FLAGS:
        while (bits < 16) {
          if (have === 0) break inf_leave;
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        state.flags = hold;
        if ((state.flags & 255) !== 8) {
          strm.msg = "unknown compression method";
          state.mode = BAD;
          break;
        }
        if (state.flags & 57344) {
          strm.msg = "unknown header flags set";
          state.mode = BAD;
          break;
        }
        if (state.head) state.head.text = hold >> 8 & 1;
        if (state.flags & 512 && state.wrap & 4) {
          hbuf[0] = hold & 255;
          hbuf[1] = hold >>> 8 & 255;
          state.check = crc32(state.check, hbuf, 2, 0);
        }
        hold = 0;
        bits = 0;
        state.mode = TIME;
      case TIME:
        while (bits < 32) {
          if (have === 0) break inf_leave;
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        if (state.head) state.head.time = hold;
        if (state.flags & 512 && state.wrap & 4) {
          hbuf[0] = hold & 255;
          hbuf[1] = hold >>> 8 & 255;
          hbuf[2] = hold >>> 16 & 255;
          hbuf[3] = hold >>> 24 & 255;
          state.check = crc32(state.check, hbuf, 4, 0);
        }
        hold = 0;
        bits = 0;
        state.mode = OS;
      case OS:
        while (bits < 16) {
          if (have === 0) break inf_leave;
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        if (state.head) {
          state.head.xflags = hold & 255;
          state.head.os = hold >> 8;
        }
        if (state.flags & 512 && state.wrap & 4) {
          hbuf[0] = hold & 255;
          hbuf[1] = hold >>> 8 & 255;
          state.check = crc32(state.check, hbuf, 2, 0);
        }
        hold = 0;
        bits = 0;
        state.mode = EXLEN;
      case EXLEN:
        if (state.flags & 1024) {
          while (bits < 16) {
            if (have === 0) break inf_leave;
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          state.length = hold;
          if (state.head) state.head.extra_len = hold;
          if (state.flags & 512 && state.wrap & 4) {
            hbuf[0] = hold & 255;
            hbuf[1] = hold >>> 8 & 255;
            state.check = crc32(state.check, hbuf, 2, 0);
          }
          hold = 0;
          bits = 0;
        } else if (state.head) state.head.extra = null;
        state.mode = EXTRA;
      case EXTRA:
        if (state.flags & 1024) {
          copy = state.length;
          if (copy > have) copy = have;
          if (copy) {
            if (state.head) {
              len = state.head.extra_len - state.length;
              if (!state.head.extra) state.head.extra = new Uint8Array(state.head.extra_len);
              state.head.extra.set(input.subarray(next, next + copy), len);
            }
            if (state.flags & 512 && state.wrap & 4) state.check = crc32(state.check, input, copy, next);
            have -= copy;
            next += copy;
            state.length -= copy;
          }
          if (state.length) break inf_leave;
        }
        state.length = 0;
        state.mode = NAME;
      case NAME:
        if (state.flags & 2048) {
          if (have === 0) break inf_leave;
          copy = 0;
          do {
            len = input[next + copy++];
            if (state.head && len && state.length < 65536) state.head.name += String.fromCharCode(len);
          } while (len && copy < have);
          if (state.flags & 512 && state.wrap & 4) state.check = crc32(state.check, input, copy, next);
          have -= copy;
          next += copy;
          if (len) break inf_leave;
        } else if (state.head) state.head.name = null;
        state.length = 0;
        state.mode = COMMENT;
      case COMMENT:
        if (state.flags & 4096) {
          if (have === 0) break inf_leave;
          copy = 0;
          do {
            len = input[next + copy++];
            if (state.head && len && state.length < 65536) state.head.comment += String.fromCharCode(len);
          } while (len && copy < have);
          if (state.flags & 512 && state.wrap & 4) state.check = crc32(state.check, input, copy, next);
          have -= copy;
          next += copy;
          if (len) break inf_leave;
        } else if (state.head) state.head.comment = null;
        state.mode = HCRC;
      case HCRC:
        if (state.flags & 512) {
          while (bits < 16) {
            if (have === 0) break inf_leave;
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          if (state.wrap & 4 && hold !== (state.check & 65535)) {
            strm.msg = "header crc mismatch";
            state.mode = BAD;
            break;
          }
          hold = 0;
          bits = 0;
        }
        if (state.head) {
          state.head.hcrc = state.flags >> 9 & 1;
          state.head.done = true;
        }
        strm.adler = state.check = 0;
        state.mode = TYPE;
        break;
      case DICTID:
        while (bits < 32) {
          if (have === 0) break inf_leave;
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        strm.adler = state.check = zswap32(hold);
        hold = 0;
        bits = 0;
        state.mode = DICT;
      case DICT:
        if (state.havedict === 0) {
          strm.next_out = put;
          strm.avail_out = left;
          strm.next_in = next;
          strm.avail_in = have;
          state.hold = hold;
          state.bits = bits;
          return 2;
        }
        strm.adler = state.check = 1;
        state.mode = TYPE;
      case TYPE:
        if (flush === 5 || flush === 6) break inf_leave;
      case TYPEDO:
        if (state.last) {
          hold >>>= bits & 7;
          bits -= bits & 7;
          state.mode = CHECK;
          break;
        }
        while (bits < 3) {
          if (have === 0) break inf_leave;
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        state.last = hold & 1;
        hold >>>= 1;
        bits -= 1;
        switch (hold & 3) {
          case 0:
            state.mode = STORED;
            break;
          case 1:
            fixedtables(state);
            state.mode = LEN_;
            if (flush === 6) {
              hold >>>= 2;
              bits -= 2;
              break inf_leave;
            }
            break;
          case 2:
            state.mode = TABLE;
            break;
          case 3:
            strm.msg = "invalid block type";
            state.mode = BAD;
        }
        hold >>>= 2;
        bits -= 2;
        break;
      case STORED:
        hold >>>= bits & 7;
        bits -= bits & 7;
        while (bits < 32) {
          if (have === 0) break inf_leave;
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        if ((hold & 65535) !== (hold >>> 16 ^ 65535)) {
          strm.msg = "invalid stored block lengths";
          state.mode = BAD;
          break;
        }
        state.length = hold & 65535;
        hold = 0;
        bits = 0;
        state.mode = COPY_;
        if (flush === 6) break inf_leave;
      case COPY_:
        state.mode = COPY;
      case COPY:
        copy = state.length;
        if (copy) {
          if (copy > have) copy = have;
          if (copy > left) copy = left;
          if (copy === 0) break inf_leave;
          output.set(input.subarray(next, next + copy), put);
          have -= copy;
          next += copy;
          left -= copy;
          put += copy;
          state.length -= copy;
          break;
        }
        state.mode = TYPE;
        break;
      case TABLE:
        while (bits < 14) {
          if (have === 0) break inf_leave;
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        state.nlen = (hold & 31) + 257;
        hold >>>= 5;
        bits -= 5;
        state.ndist = (hold & 31) + 1;
        hold >>>= 5;
        bits -= 5;
        state.ncode = (hold & 15) + 4;
        hold >>>= 4;
        bits -= 4;
        if (state.nlen > 286 || state.ndist > 30) {
          strm.msg = "too many length or distance symbols";
          state.mode = BAD;
          break;
        }
        state.have = 0;
        state.mode = LENLENS;
      case LENLENS:
        while (state.have < state.ncode) {
          while (bits < 3) {
            if (have === 0) break inf_leave;
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          state.lens[order[state.have++]] = hold & 7;
          hold >>>= 3;
          bits -= 3;
        }
        while (state.have < 19) state.lens[order[state.have++]] = 0;
        state.lencode = state.lendyn;
        state.lenbits = 7;
        opts = { bits: state.lenbits };
        ret = inflate_table(CODES, state.lens, 0, 19, state.lencode, 0, state.work, opts);
        state.lenbits = opts.bits;
        if (ret) {
          strm.msg = "invalid code lengths set";
          state.mode = BAD;
          break;
        }
        state.have = 0;
        state.mode = CODELENS;
      case CODELENS:
        while (state.have < state.nlen + state.ndist) {
          for (; ; ) {
            here = state.lencode[hold & (1 << state.lenbits) - 1];
            here_bits = here >>> 24;
            here_op = here >>> 16 & 255;
            here_val = here & 65535;
            if (here_bits <= bits) break;
            if (have === 0) break inf_leave;
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          if (here_val < 16) {
            hold >>>= here_bits;
            bits -= here_bits;
            state.lens[state.have++] = here_val;
          } else {
            if (here_val === 16) {
              n = here_bits + 2;
              while (bits < n) {
                if (have === 0) break inf_leave;
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              hold >>>= here_bits;
              bits -= here_bits;
              if (state.have === 0) {
                strm.msg = "invalid bit length repeat";
                state.mode = BAD;
                break;
              }
              len = state.lens[state.have - 1];
              copy = 3 + (hold & 3);
              hold >>>= 2;
              bits -= 2;
            } else if (here_val === 17) {
              n = here_bits + 3;
              while (bits < n) {
                if (have === 0) break inf_leave;
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              hold >>>= here_bits;
              bits -= here_bits;
              len = 0;
              copy = 3 + (hold & 7);
              hold >>>= 3;
              bits -= 3;
            } else {
              n = here_bits + 7;
              while (bits < n) {
                if (have === 0) break inf_leave;
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              hold >>>= here_bits;
              bits -= here_bits;
              len = 0;
              copy = 11 + (hold & 127);
              hold >>>= 7;
              bits -= 7;
            }
            if (state.have + copy > state.nlen + state.ndist) {
              strm.msg = "invalid bit length repeat";
              state.mode = BAD;
              break;
            }
            while (copy--) state.lens[state.have++] = len;
          }
        }
        if (state.mode === BAD) break;
        if (state.lens[256] === 0) {
          strm.msg = "invalid code -- missing end-of-block";
          state.mode = BAD;
          break;
        }
        state.lenbits = 9;
        opts = { bits: state.lenbits };
        ret = inflate_table(LENS, state.lens, 0, state.nlen, state.lencode, 0, state.work, opts);
        state.lenbits = opts.bits;
        if (ret) {
          strm.msg = "invalid literal/lengths set";
          state.mode = BAD;
          break;
        }
        state.distbits = 6;
        state.distcode = state.distdyn;
        opts = { bits: state.distbits };
        ret = inflate_table(DISTS, state.lens, state.nlen, state.ndist, state.distcode, 0, state.work, opts);
        state.distbits = opts.bits;
        if (ret) {
          strm.msg = "invalid distances set";
          state.mode = BAD;
          break;
        }
        state.mode = LEN_;
        if (flush === 6) break inf_leave;
      case LEN_:
        state.mode = LEN;
      case LEN:
        if (have >= 6 && left >= 258) {
          strm.next_out = put;
          strm.avail_out = left;
          strm.next_in = next;
          strm.avail_in = have;
          state.hold = hold;
          state.bits = bits;
          inflate_fast(strm, _out);
          put = strm.next_out;
          output = strm.output;
          left = strm.avail_out;
          next = strm.next_in;
          input = strm.input;
          have = strm.avail_in;
          hold = state.hold;
          bits = state.bits;
          if (state.mode === TYPE) state.back = -1;
          break;
        }
        state.back = 0;
        for (; ; ) {
          here = state.lencode[hold & (1 << state.lenbits) - 1];
          here_bits = here >>> 24;
          here_op = here >>> 16 & 255;
          here_val = here & 65535;
          if (here_bits <= bits) break;
          if (have === 0) break inf_leave;
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        if (here_op && (here_op & 240) === 0) {
          last_bits = here_bits;
          last_op = here_op;
          last_val = here_val;
          for (; ; ) {
            here = state.lencode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> last_bits)];
            here_bits = here >>> 24;
            here_op = here >>> 16 & 255;
            here_val = here & 65535;
            if (last_bits + here_bits <= bits) break;
            if (have === 0) break inf_leave;
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          hold >>>= last_bits;
          bits -= last_bits;
          state.back += last_bits;
        }
        hold >>>= here_bits;
        bits -= here_bits;
        state.back += here_bits;
        state.length = here_val;
        if (here_op === 0) {
          state.mode = LIT;
          break;
        }
        if (here_op & 32) {
          state.back = -1;
          state.mode = TYPE;
          break;
        }
        if (here_op & 64) {
          strm.msg = "invalid literal/length code";
          state.mode = BAD;
          break;
        }
        state.extra = here_op & 15;
        state.mode = LENEXT;
      case LENEXT:
        if (state.extra) {
          n = state.extra;
          while (bits < n) {
            if (have === 0) break inf_leave;
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          state.length += hold & (1 << state.extra) - 1;
          hold >>>= state.extra;
          bits -= state.extra;
          state.back += state.extra;
        }
        state.was = state.length;
        state.mode = DIST;
      case DIST:
        for (; ; ) {
          here = state.distcode[hold & (1 << state.distbits) - 1];
          here_bits = here >>> 24;
          here_op = here >>> 16 & 255;
          here_val = here & 65535;
          if (here_bits <= bits) break;
          if (have === 0) break inf_leave;
          have--;
          hold += input[next++] << bits;
          bits += 8;
        }
        if ((here_op & 240) === 0) {
          last_bits = here_bits;
          last_op = here_op;
          last_val = here_val;
          for (; ; ) {
            here = state.distcode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> last_bits)];
            here_bits = here >>> 24;
            here_op = here >>> 16 & 255;
            here_val = here & 65535;
            if (last_bits + here_bits <= bits) break;
            if (have === 0) break inf_leave;
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          hold >>>= last_bits;
          bits -= last_bits;
          state.back += last_bits;
        }
        hold >>>= here_bits;
        bits -= here_bits;
        state.back += here_bits;
        if (here_op & 64) {
          strm.msg = "invalid distance code";
          state.mode = BAD;
          break;
        }
        state.offset = here_val;
        state.extra = here_op & 15;
        state.mode = DISTEXT;
      case DISTEXT:
        if (state.extra) {
          n = state.extra;
          while (bits < n) {
            if (have === 0) break inf_leave;
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          state.offset += hold & (1 << state.extra) - 1;
          hold >>>= state.extra;
          bits -= state.extra;
          state.back += state.extra;
        }
        if (state.offset > state.dmax) {
          strm.msg = "invalid distance too far back";
          state.mode = BAD;
          break;
        }
        state.mode = MATCH;
      case MATCH:
        if (left === 0) break inf_leave;
        copy = _out - left;
        if (state.offset > copy) {
          copy = state.offset - copy;
          if (copy > state.whave) {
            if (state.sane) {
              strm.msg = "invalid distance too far back";
              state.mode = BAD;
              break;
            }
          }
          if (copy > state.wnext) {
            copy -= state.wnext;
            from = state.wsize - copy;
          } else from = state.wnext - copy;
          if (copy > state.length) copy = state.length;
          from_source = state.window;
        } else {
          from_source = output;
          from = put - state.offset;
          copy = state.length;
        }
        if (copy > left) copy = left;
        left -= copy;
        state.length -= copy;
        do
          output[put++] = from_source[from++];
        while (--copy);
        if (state.length === 0) state.mode = LEN;
        break;
      case LIT:
        if (left === 0) break inf_leave;
        output[put++] = state.length;
        left--;
        state.mode = LEN;
        break;
      case CHECK:
        if (state.wrap) {
          while (bits < 32) {
            if (have === 0) break inf_leave;
            have--;
            hold |= input[next++] << bits;
            bits += 8;
          }
          _out -= left;
          strm.total_out += _out;
          state.total += _out;
          if (state.wrap & 4 && _out) strm.adler = state.check = state.flags ? crc32(state.check, output, _out, put - _out) : adler32(state.check, output, _out, put - _out);
          _out = left;
          if (state.wrap & 4 && (state.flags ? hold : zswap32(hold)) !== state.check) {
            strm.msg = "incorrect data check";
            state.mode = BAD;
            break;
          }
          hold = 0;
          bits = 0;
        }
        state.mode = LENGTH;
      case LENGTH:
        if (state.wrap && state.flags) {
          while (bits < 32) {
            if (have === 0) break inf_leave;
            have--;
            hold += input[next++] << bits;
            bits += 8;
          }
          if (state.wrap & 4 && hold !== (state.total & 4294967295)) {
            strm.msg = "incorrect length check";
            state.mode = BAD;
            break;
          }
          hold = 0;
          bits = 0;
        }
        state.mode = DONE;
      case DONE:
        ret = 1;
        break inf_leave;
      case BAD:
        ret = -3;
        break inf_leave;
      case MEM:
        return -4;
      case SYNC:
      default:
        return -2;
    }
    strm.next_out = put;
    strm.avail_out = left;
    strm.next_in = next;
    strm.avail_in = have;
    state.hold = hold;
    state.bits = bits;
    if (state.wsize || _out !== strm.avail_out && state.mode < BAD && (state.mode < CHECK || flush !== 4)) {
      if (updatewindow(strm, strm.output, strm.next_out, _out - strm.avail_out)) {
        state.mode = MEM;
        return -4;
      }
    }
    _in -= strm.avail_in;
    _out -= strm.avail_out;
    strm.total_in += _in;
    strm.total_out += _out;
    state.total += _out;
    if (state.wrap & 4 && _out) strm.adler = state.check = state.flags ? crc32(state.check, output, _out, strm.next_out - _out) : adler32(state.check, output, _out, strm.next_out - _out);
    strm.data_type = state.bits + (state.last ? 64 : 0) + (state.mode === TYPE ? 128 : 0) + (state.mode === LEN_ || state.mode === COPY_ ? 256 : 0);
    if ((_in === 0 && _out === 0 || flush === 4) && ret === 0) ret = -5;
    return ret;
  };
  var inflateEnd = (strm) => {
    if (inflateStateCheck(strm)) return -2;
    let state = strm.state;
    if (state.window) state.window = null;
    strm.state = null;
    return 0;
  };
  var inflateSetDictionary = (strm, dictionary) => {
    const dictLength = dictionary.length;
    let state;
    let dictid;
    let ret;
    if (inflateStateCheck(strm)) return -2;
    state = strm.state;
    if (state.wrap !== 0 && state.mode !== DICT) return -2;
    if (state.mode === DICT) {
      dictid = 1;
      dictid = adler32(dictid, dictionary, dictLength, 0);
      if (dictid !== state.check) return -3;
    }
    ret = updatewindow(strm, dictionary, dictLength, dictLength);
    if (ret) {
      state.mode = MEM;
      return -4;
    }
    state.havedict = 1;
    return 0;
  };
  var ZStream = class {
    constructor() {
      this.input = null;
      this.next_in = 0;
      this.avail_in = 0;
      this.total_in = 0;
      this.output = null;
      this.next_out = 0;
      this.avail_out = 0;
      this.total_out = 0;
      this.msg = "";
      this.state = null;
      this.data_type = 2;
      this.adler = 0;
    }
  };
  var flattenChunks = (chunks) => {
    const result = new Uint8Array(chunks.reduce((len, chunk) => len + chunk.length, 0));
    let pos = 0;
    for (const chunk of chunks) {
      result.set(chunk, pos);
      pos += chunk.length;
    }
    return result;
  };
  var toString = Object.prototype.toString;
  var defaultOptions = {
    chunkSize: 1024 * 64,
    windowBits: 15,
    raw: false,
    dictionary: /* @__PURE__ */ new Uint8Array(0)
  };
  var Inflate = class {
    options;
    /**
    * Error code after inflate finishes. {@link Z_OK} on success.
    * Should be checked when broken data is possible.
    */
    err;
    /** Error message, if {@link Inflate.err} is not {@link Z_OK}. */
    msg;
    /**
    * `true` once the compressed stream has ended. A stream may end before the
    * caller's data does (trailing bytes), so check this to know when to stop
    * pushing - further {@link Inflate.push} calls are no-ops.
    */
    ended;
    started;
    /**
    * Chunks of output data, if {@link Inflate.onData} not overridden.
    * @internal
    */
    chunks;
    strm;
    /**
    * Uncompressed result, generated by default {@link Inflate.onData}
    * and {@link Inflate.onEnd} handlers. Filled after you push last chunk
    * (call {@link Inflate.push} with {@link Z_FINISH} / `true` param).
    */
    result;
    /**
    * Creates a new inflator instance with the specified params. Throws an
    * exception on bad params. See {@link InflateOptions} for the list of
    * supported options.
    *
    * By default, when no options are set, the deflate/gzip data format is
    * autodetected via the wrapper header.
    *
    * @example
    * ```javascript
    * import { Inflate } from 'pako'
    *
    * const chunk1 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])
    * const chunk2 = new Uint8Array([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
    *
    * const inflate = new Inflate({ level: 3 })
    *
    * inflate.push(chunk1, false)
    * inflate.push(chunk2, true)  // true -> last chunk
    *
    * if (inflate.err) throw new Error(inflate.err)
    *
    * console.log(inflate.result)
    * ```
    */
    constructor(options = {}) {
      this.options = Object.assign({}, defaultOptions, options);
      const opt = this.options;
      if (opt.raw && opt.windowBits >= 0 && opt.windowBits < 16) {
        opt.windowBits = -opt.windowBits;
        if (opt.windowBits === 0) opt.windowBits = -15;
      }
      if (opt.windowBits >= 0 && opt.windowBits < 16 && !options.windowBits) opt.windowBits += 32;
      if (opt.windowBits > 15 && opt.windowBits < 48) {
        if ((opt.windowBits & 15) === 0) opt.windowBits |= 15;
      }
      this.err = 0;
      this.msg = "";
      this.ended = false;
      this.started = false;
      this.chunks = [];
      this.result = /* @__PURE__ */ new Uint8Array(0);
      this.strm = new ZStream();
      this.strm.avail_out = 0;
      let status = inflateInit2(this.strm, opt.windowBits);
      if (status !== 0) throw new Error(messages_default[status]);
      if (toString.call(opt.dictionary) === "[object ArrayBuffer]") opt.dictionary = new Uint8Array(opt.dictionary);
      const dictionary = opt.dictionary;
      if (opt.raw && dictionary.length) {
        status = inflateSetDictionary(this.strm, dictionary);
        if (status !== 0) throw new Error(messages_default[status]);
      }
    }
    /**
    * Sends input data to the inflate pipe, generating {@link Inflate.onData} calls
    * with new output chunks. Returns `true` on success. If end of stream is
    * detected, {@link Inflate.onEnd} will be called.
    *
    * `flush_mode` is not needed for normal operation, because end of stream
    * is detected automatically. Pass {@link Z_SYNC_FLUSH} to force the decoder
    * to emit all currently available output — handy when you need to decode
    * data frame-by-frame from a long-running stream.
    *
    * On failure, calls {@link Inflate.onEnd} with the error code and returns false.
    *
    * Once the stream has ended (a compressed stream may end before your data
    * does), further `push` calls are no-ops and return whether the decode
    * finished successfully. The final outcome is in {@link Inflate.result},
    * {@link Inflate.err} and {@link Inflate.msg}.
    *
    * @param flush_mode 0..6 for corresponding {@link Z_NO_FLUSH}..{@link Z_TREES}
    *   flush modes. See constants. Skipped or `false` means {@link Z_NO_FLUSH},
    *   `true` means {@link Z_FINISH}.
    *
    * @example
    * ```javascript
    * push(chunk, false) // push one of data chunks
    * ...
    * push(chunk, true)  // push last chunk
    * ```
    */
    push(data, flush_mode = false) {
      const strm = this.strm;
      const chunkSize = this.options.chunkSize;
      let status;
      let _flush_mode;
      let last_avail_out;
      if (this.ended) return this.err === 0;
      if (typeof flush_mode === "number") _flush_mode = flush_mode;
      else _flush_mode = flush_mode === true ? 4 : 0;
      if (toString.call(data) === "[object ArrayBuffer]") strm.input = new Uint8Array(data);
      else strm.input = data;
      strm.next_in = 0;
      strm.avail_in = strm.input.length;
      if (!this.started) {
        this.started = true;
        this.onStart(strm);
      }
      for (; ; ) {
        if (strm.avail_out === 0) {
          strm.output = new Uint8Array(chunkSize);
          strm.next_out = 0;
          strm.avail_out = chunkSize;
        }
        status = inflate$1(strm, _flush_mode);
        if (status === 2) {
          const dictionary = this.options.dictionary;
          if (dictionary.length) {
            status = inflateSetDictionary(strm, dictionary);
            if (status === 0) status = inflate$1(strm, _flush_mode);
            else if (status === -3) status = 2;
          }
        }
        while (strm.avail_in > 0 && status === 1 && strm.state.wrap & 2 && strm.state.flags !== 0 && strm.input[strm.next_in] !== 0) {
          inflateReset(strm);
          status = inflate$1(strm, _flush_mode);
        }
        if (status === -2 || status === -3 || status === 2 || status === -4) break;
        last_avail_out = strm.avail_out;
        if (strm.next_out) {
          if (strm.avail_out === 0 || status === 1 || _flush_mode > 0) {
            this.onData(strm.output.length === strm.next_out ? strm.output : strm.output.subarray(0, strm.next_out));
            strm.avail_out = 0;
            strm.next_out = 0;
          }
        }
        if ((status === 0 || status === -5) && last_avail_out === 0) continue;
        if (status === 1) {
          status = inflateEnd(this.strm);
          break;
        }
        if (strm.avail_in === 0) {
          if (_flush_mode === 4) {
            status = inflateEnd(this.strm);
            if (status === 0) status = -5;
            break;
          }
          return true;
        }
      }
      this.err = status;
      this.msg = strm.msg || messages_default[status];
      this.ended = true;
      this.onEnd(status);
      return status === 0;
    }
    /**
    * Called once before the first low-level inflate call.
    *
    * Override this handler to attach low-level inflate state, for example to read
    * gzip header metadata:
    *
    * ```javascript
    * import { Inflate, GZheader, zlibInflateGetHeader } from 'pako'
    *
    * const inflator = new Inflate()
    *
    * inflator.onStart = function (strm) {
    *   this.header = new GZheader()
    *   zlibInflateGetHeader(strm, this.header)
    * }
    *
    * inflator.push(data, true)
    * console.log(inflator.header.name)
    * ```
    */
    onStart(strm) {
    }
    /**
    * By default, stores data blocks in the {@link Inflate.chunks} property and glues
    * them in {@link Inflate.onEnd}. Override this handler if you need another behaviour.
    *
    * @param chunk output data.
    */
    onData(chunk) {
      this.chunks.push(chunk);
    }
    /**
    * Called after you tell inflate that the input stream is
    * complete ({@link Z_FINISH}). By default, joins the collected {@link Inflate.chunks},
    * frees memory and fills the {@link Inflate.result} property.
    *
    * @param status inflate status. {@link Z_OK} on success, other if not.
    */
    onEnd(status) {
      if (status === 0) this.result = flattenChunks(this.chunks);
      this.chunks = [];
    }
  };
  function inflate(input, options = {}) {
    const inflator = new Inflate(options);
    inflator.push(input, true);
    if (inflator.err) throw new Error(inflator.msg);
    const result = inflator.result;
    return options.toText ? new TextDecoder().decode(result) : result;
  }

  // danmu-src/Long.ts
  var wasm = null;
  try {
    wasm = new WebAssembly.Instance(
      new WebAssembly.Module(
        new Uint8Array([
          // \0asm
          0,
          97,
          115,
          109,
          // version 1
          1,
          0,
          0,
          0,
          // section "type"
          1,
          13,
          2,
          // 0, () => i32
          96,
          0,
          1,
          127,
          // 1, (i32, i32, i32, i32) => i32
          96,
          4,
          127,
          127,
          127,
          127,
          1,
          127,
          // section "function"
          3,
          7,
          6,
          // 0, type 0
          0,
          // 1, type 1
          1,
          // 2, type 1
          1,
          // 3, type 1
          1,
          // 4, type 1
          1,
          // 5, type 1
          1,
          // section "global"
          6,
          6,
          1,
          // 0, "high", mutable i32
          127,
          1,
          65,
          0,
          11,
          // section "export"
          7,
          50,
          6,
          // 0, "mul"
          3,
          109,
          117,
          108,
          0,
          1,
          // 1, "div_s"
          5,
          100,
          105,
          118,
          95,
          115,
          0,
          2,
          // 2, "div_u"
          5,
          100,
          105,
          118,
          95,
          117,
          0,
          3,
          // 3, "rem_s"
          5,
          114,
          101,
          109,
          95,
          115,
          0,
          4,
          // 4, "rem_u"
          5,
          114,
          101,
          109,
          95,
          117,
          0,
          5,
          // 5, "get_high"
          8,
          103,
          101,
          116,
          95,
          104,
          105,
          103,
          104,
          0,
          0,
          // section "code"
          10,
          191,
          1,
          6,
          // 0, "get_high"
          4,
          0,
          35,
          0,
          11,
          // 1, "mul"
          36,
          1,
          1,
          126,
          32,
          0,
          173,
          32,
          1,
          173,
          66,
          32,
          134,
          132,
          32,
          2,
          173,
          32,
          3,
          173,
          66,
          32,
          134,
          132,
          126,
          34,
          4,
          66,
          32,
          135,
          167,
          36,
          0,
          32,
          4,
          167,
          11,
          // 2, "div_s"
          36,
          1,
          1,
          126,
          32,
          0,
          173,
          32,
          1,
          173,
          66,
          32,
          134,
          132,
          32,
          2,
          173,
          32,
          3,
          173,
          66,
          32,
          134,
          132,
          127,
          34,
          4,
          66,
          32,
          135,
          167,
          36,
          0,
          32,
          4,
          167,
          11,
          // 3, "div_u"
          36,
          1,
          1,
          126,
          32,
          0,
          173,
          32,
          1,
          173,
          66,
          32,
          134,
          132,
          32,
          2,
          173,
          32,
          3,
          173,
          66,
          32,
          134,
          132,
          128,
          34,
          4,
          66,
          32,
          135,
          167,
          36,
          0,
          32,
          4,
          167,
          11,
          // 4, "rem_s"
          36,
          1,
          1,
          126,
          32,
          0,
          173,
          32,
          1,
          173,
          66,
          32,
          134,
          132,
          32,
          2,
          173,
          32,
          3,
          173,
          66,
          32,
          134,
          132,
          129,
          34,
          4,
          66,
          32,
          135,
          167,
          36,
          0,
          32,
          4,
          167,
          11,
          // 5, "rem_u"
          36,
          1,
          1,
          126,
          32,
          0,
          173,
          32,
          1,
          173,
          66,
          32,
          134,
          132,
          32,
          2,
          173,
          32,
          3,
          173,
          66,
          32,
          134,
          132,
          130,
          34,
          4,
          66,
          32,
          135,
          167,
          36,
          0,
          32,
          4,
          167,
          11
        ])
      ),
      {}
    ).exports;
  } catch {
  }
  var INT_CACHE = {};
  var UINT_CACHE = {};
  var Long = class {
    low;
    high;
    unsigned;
    __isLong__;
    constructor(low, high, unsigned) {
      this.low = low | 0;
      this.high = high | 0;
      this.unsigned = !!unsigned;
      this.__isLong__ = true;
    }
    /**
     * 是否零
     * @returns
     */
    isZero() {
      return this.high === 0 && this.low === 0;
    }
    /**
     * 是否奇数
     * @returns
     */
    isOdd() {
      return (this.low & 1) === 1;
    }
    /**
     * 是否负数
     * @returns
     */
    isNegative() {
      return !this.unsigned && this.high < 0;
    }
    /**
     * 非运算
     * @returns
     */
    neg() {
      if (!this.unsigned && this.eq(MIN_VALUE)) return MIN_VALUE;
      return this.not().add(ONE);
    }
    /**
     * 按位非
     * @returns
     */
    not() {
      return fromBits(~this.low, ~this.high, this.unsigned);
    }
    /**
     * 比较
     * @param other 0|相等;1|大于;-1|小于
     * @returns
     */
    comp(other) {
      if (!isLong(other)) other = fromValue(other);
      if (this.eq(other)) return 0;
      const thisNeg = this.isNegative(), otherNeg = other.isNegative();
      if (thisNeg && !otherNeg) return -1;
      if (!thisNeg && otherNeg) return 1;
      if (!this.unsigned) return this.sub(other).isNegative() ? -1 : 1;
      return other.high >>> 0 > this.high >>> 0 || other.high === this.high && other.low >>> 0 > this.low >>> 0 ? -1 : 1;
    }
    /**
     * 是否相等
     * @param other
     * @returns
     */
    eq(other) {
      if (!isLong(other)) other = fromValue(other);
      if (this.unsigned !== other.unsigned && this.high >>> 31 === 1 && other.high >>> 31 === 1) return false;
      return this.high === other.high && this.low === other.low;
    }
    /**
     * 小于
     * @param other
     * @returns
     */
    lt(other) {
      return this.comp(other) < 0;
    }
    /**
     * 大于
     * @param other
     * @returns
     */
    gt(other) {
      return this.comp(other) > 0;
    }
    /**
     * 大于等于
     * @param other
     * @returns
     */
    gte(other) {
      return this.comp(other) >= 0;
    }
    /**
     * 左移 <<
     * @param numBits
     * @returns
     */
    shl(numBits) {
      if (isLong(numBits)) numBits = numBits.toInt();
      if ((numBits &= 63) === 0) return this;
      else if (numBits < 32)
        return fromBits(this.low << numBits, this.high << numBits | this.low >>> 32 - numBits, this.unsigned);
      else return fromBits(0, this.low << numBits - 32, this.unsigned);
    }
    /**
     * 右移 >>
     * @param numBits
     * @returns
     */
    shr(numBits) {
      if (isLong(numBits)) numBits = numBits.toInt();
      if ((numBits &= 63) === 0) return this;
      else if (numBits < 32)
        return fromBits(this.low >>> numBits | this.high << 32 - numBits, this.high >> numBits, this.unsigned);
      else return fromBits(this.high >> numBits - 32, this.high >= 0 ? 0 : -1, this.unsigned);
    }
    /**
     * 无符号右移
     * @param numBits
     * @returns
     */
    shru(numBits) {
      if (isLong(numBits)) numBits = numBits.toInt();
      if ((numBits &= 63) === 0) return this;
      if (numBits < 32)
        return fromBits(this.low >>> numBits | this.high << 32 - numBits, this.high >>> numBits, this.unsigned);
      if (numBits === 32) return fromBits(this.high, 0, this.unsigned);
      return fromBits(this.high >>> numBits - 32, 0, this.unsigned);
    }
    /**
     * 加
     * @param addend
     * @returns
     */
    add(addend) {
      if (!isLong(addend)) addend = fromValue(addend);
      const a48 = this.high >>> 16;
      const a32 = this.high & 65535;
      const a16 = this.low >>> 16;
      const a00 = this.low & 65535;
      const b48 = addend.high >>> 16;
      const b32 = addend.high & 65535;
      const b16 = addend.low >>> 16;
      const b00 = addend.low & 65535;
      let c48 = 0, c32 = 0, c16 = 0, c00 = 0;
      c00 += a00 + b00;
      c16 += c00 >>> 16;
      c00 &= 65535;
      c16 += a16 + b16;
      c32 += c16 >>> 16;
      c16 &= 65535;
      c32 += a32 + b32;
      c48 += c32 >>> 16;
      c32 &= 65535;
      c48 += a48 + b48;
      c48 &= 65535;
      return fromBits(c16 << 16 | c00, c48 << 16 | c32, this.unsigned);
    }
    /**
     * 减
     * @param subtrahend
     * @returns
     */
    sub(subtrahend) {
      if (!isLong(subtrahend)) subtrahend = fromValue(subtrahend);
      return this.add(subtrahend.neg());
    }
    /**
     * 乘
     * @param multiplier
     * @returns
     */
    mul(multiplier) {
      if (this.isZero()) return this;
      if (!isLong(multiplier)) multiplier = fromValue(multiplier);
      if (wasm) {
        const low = wasm["mul"](this.low, this.high, multiplier.low, multiplier.high);
        return fromBits(low, wasm["get_high"](), this.unsigned);
      }
      if (multiplier.isZero()) return this.unsigned ? UZERO : ZERO;
      if (this.eq(MIN_VALUE)) return multiplier.isOdd() ? MIN_VALUE : ZERO;
      if (multiplier.eq(MIN_VALUE)) return this.isOdd() ? MIN_VALUE : ZERO;
      if (this.isNegative()) {
        if (multiplier.isNegative()) return this.neg().mul(multiplier.neg());
        else return this.neg().mul(multiplier).neg();
      } else if (multiplier.isNegative()) return this.mul(multiplier.neg()).neg();
      if (this.lt(TWO_PWR_24) && multiplier.lt(TWO_PWR_24))
        return fromNumber(this.toNumber() * multiplier.toNumber(), this.unsigned);
      const a48 = this.high >>> 16;
      const a32 = this.high & 65535;
      const a16 = this.low >>> 16;
      const a00 = this.low & 65535;
      const b48 = multiplier.high >>> 16;
      const b32 = multiplier.high & 65535;
      const b16 = multiplier.low >>> 16;
      const b00 = multiplier.low & 65535;
      let c48 = 0, c32 = 0, c16 = 0, c00 = 0;
      c00 += a00 * b00;
      c16 += c00 >>> 16;
      c00 &= 65535;
      c16 += a16 * b00;
      c32 += c16 >>> 16;
      c16 &= 65535;
      c16 += a00 * b16;
      c32 += c16 >>> 16;
      c16 &= 65535;
      c32 += a32 * b00;
      c48 += c32 >>> 16;
      c32 &= 65535;
      c32 += a16 * b16;
      c48 += c32 >>> 16;
      c32 &= 65535;
      c32 += a00 * b32;
      c48 += c32 >>> 16;
      c32 &= 65535;
      c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48;
      c48 &= 65535;
      return fromBits(c16 << 16 | c00, c48 << 16 | c32, this.unsigned);
    }
    /**
     * 除
     * @param divisor
     * @returns
     */
    div(divisor) {
      if (!isLong(divisor)) divisor = fromValue(divisor);
      if (divisor.isZero()) throw Error("division by zero");
      if (wasm) {
        if (!this.unsigned && this.high === -2147483648 && divisor.low === -1 && divisor.high === -1) {
          return this;
        }
        const low = (this.unsigned ? wasm["div_u"] : wasm["div_s"])(this.low, this.high, divisor.low, divisor.high);
        return fromBits(low, wasm["get_high"](), this.unsigned);
      }
      if (this.isZero()) return this.unsigned ? UZERO : ZERO;
      let approx, rem, res;
      if (!this.unsigned) {
        if (this.eq(MIN_VALUE)) {
          if (divisor.eq(ONE) || divisor.eq(NEG_ONE)) return MIN_VALUE;
          else if (divisor.eq(MIN_VALUE)) return ONE;
          else {
            const halfThis = this.shr(1);
            approx = halfThis.div(divisor).shl(1);
            if (approx.eq(ZERO)) {
              return divisor.isNegative() ? ONE : NEG_ONE;
            } else {
              rem = this.sub(divisor.mul(approx));
              res = approx.add(rem.div(divisor));
              return res;
            }
          }
        } else if (divisor.eq(MIN_VALUE)) return this.unsigned ? UZERO : ZERO;
        if (this.isNegative()) {
          if (divisor.isNegative()) return this.neg().div(divisor.neg());
          return this.neg().div(divisor).neg();
        } else if (divisor.isNegative()) return this.div(divisor.neg()).neg();
        res = ZERO;
      } else {
        if (!divisor.unsigned) divisor = divisor.toUnsigned();
        if (divisor.gt(this)) return UZERO;
        if (divisor.gt(this.shru(1))) return UONE;
        res = UZERO;
      }
      rem = this;
      while (rem.gte(divisor)) {
        approx = Math.max(1, Math.floor(rem.toNumber() / divisor.toNumber()));
        let log2 = Math.ceil(Math.log(approx) / Math.LN2), delta = log2 <= 48 ? 1 : pow_dbl(2, log2 - 48), approxRes = fromNumber(approx), approxRem = approxRes.mul(divisor);
        while (approxRem.isNegative() || approxRem.gt(rem)) {
          approx -= delta;
          approxRes = fromNumber(approx, this.unsigned);
          approxRem = approxRes.mul(divisor);
        }
        if (approxRes.isZero()) approxRes = ONE;
        res = res.add(approxRes);
        rem = rem.sub(approxRem);
      }
      return res;
    }
    /**
     * 将 Long 转换为指定进制的字符串
     * @param radix
     * @returns
     */
    toString(radix) {
      radix = radix || 10;
      if (radix < 2 || 36 < radix) throw RangeError("radix");
      if (this.isZero()) return "0";
      if (this.isNegative()) {
        if (this.eq(MIN_VALUE)) {
          const radixLong = fromNumber(radix), div = this.div(radixLong), rem1 = div.mul(radixLong).sub(this);
          return div.toString(radix) + rem1.toInt().toString(radix);
        } else return "-" + this.neg().toString(radix);
      }
      const radixToPower = fromNumber(pow_dbl(radix, 6), this.unsigned);
      let rem;
      rem = this;
      let result = "";
      while (true) {
        const remDiv = rem.div(radixToPower);
        let intval = rem.sub(remDiv.mul(radixToPower)).toInt() >>> 0, digits = intval.toString(radix);
        rem = remDiv;
        if (rem.isZero()) return digits + result;
        else {
          while (digits.length < 6) digits = "0" + digits;
          result = "" + digits + result;
        }
      }
    }
    /**
     * 将 Long 转换为 number
     * @returns
     */
    toNumber() {
      if (this.unsigned) return (this.high >>> 0) * TWO_PWR_32_DBL + (this.low >>> 0);
      return this.high * TWO_PWR_32_DBL + (this.low >>> 0);
    }
    /**
     * 将 Long 转换为 整数
     * @returns
     */
    toInt() {
      return this.unsigned ? this.low >>> 0 : this.low;
    }
    /**
     * 将 Long 转换为 无符号 Long
     * @returns
     */
    toUnsigned() {
      if (this.unsigned) return this;
      return fromBits(this.low, this.high, true);
    }
    static fromString = fromString;
    static fromValue = fromValue;
    static fromNumber = fromNumber;
    static fromInt = fromInt;
  };
  var UZERO = fromInt(0, true);
  var ZERO = fromInt(0);
  var ONE = fromInt(1);
  var UONE = fromInt(1, true);
  var NEG_ONE = fromInt(-1);
  var TWO_PWR_16_DBL = 1 << 16;
  var TWO_PWR_24_DBL = 1 << 24;
  var TWO_PWR_24 = fromInt(TWO_PWR_24_DBL);
  var TWO_PWR_32_DBL = TWO_PWR_16_DBL * TWO_PWR_16_DBL;
  var TWO_PWR_64_DBL = TWO_PWR_32_DBL * TWO_PWR_32_DBL;
  var TWO_PWR_63_DBL = TWO_PWR_64_DBL / 2;
  var MAX_UNSIGNED_VALUE = fromBits(4294967295 | 0, 4294967295 | 0, true);
  var MAX_VALUE = fromBits(4294967295 | 0, 2147483647 | 0, false);
  var MIN_VALUE = fromBits(0, 2147483648 | 0, false);
  var pow_dbl = Math.pow;
  function fromBits(lowBits, highBits, unsigned) {
    return new Long(lowBits, highBits, unsigned);
  }
  function fromInt(value, unsigned) {
    let obj, cachedObj, cache;
    if (unsigned) {
      value >>>= 0;
      if (cache = 0 <= value && value < 256) {
        cachedObj = UINT_CACHE[value];
        if (cachedObj) return cachedObj;
      }
      obj = fromBits(value, 0, true);
      if (cache) UINT_CACHE[value] = obj;
      return obj;
    } else {
      value |= 0;
      if (cache = -128 <= value && value < 128) {
        cachedObj = INT_CACHE[value];
        if (cachedObj) return cachedObj;
      }
      obj = fromBits(value, value < 0 ? -1 : 0, false);
      if (cache) INT_CACHE[value] = obj;
      return obj;
    }
  }
  function fromString(str, unsigned, radix) {
    if (str.length === 0) throw Error("empty string");
    if (typeof unsigned === "number") {
      radix = unsigned;
      unsigned = false;
    } else {
      unsigned = !!unsigned;
    }
    if (str === "NaN" || str === "Infinity" || str === "+Infinity" || str === "-Infinity") return unsigned ? UZERO : ZERO;
    radix = radix || 10;
    if (radix < 2 || 36 < radix) throw RangeError("radix");
    let p;
    if ((p = str.indexOf("-")) > 0) throw Error("interior hyphen");
    else if (p === 0) {
      return fromString(str.substring(1), unsigned, radix).neg();
    }
    const radixToPower = fromNumber(pow_dbl(radix, 8));
    let result = ZERO;
    for (let i = 0; i < str.length; i += 8) {
      const size = Math.min(8, str.length - i), value = parseInt(str.substring(i, i + size), radix);
      if (size < 8) {
        const power = fromNumber(pow_dbl(radix, size));
        result = result.mul(power).add(fromNumber(value));
      } else {
        result = result.mul(radixToPower);
        result = result.add(fromNumber(value));
      }
    }
    result.unsigned = unsigned;
    return result;
  }
  function fromNumber(value, unsigned) {
    if (isNaN(value)) return unsigned ? UZERO : ZERO;
    if (unsigned) {
      if (value < 0) return UZERO;
      if (value >= TWO_PWR_64_DBL) return MAX_UNSIGNED_VALUE;
    } else {
      if (value <= -TWO_PWR_63_DBL) return MIN_VALUE;
      if (value + 1 >= TWO_PWR_63_DBL) return MAX_VALUE;
    }
    if (value < 0) return fromNumber(-value, unsigned).neg();
    return fromBits(value % TWO_PWR_32_DBL | 0, value / TWO_PWR_32_DBL | 0, unsigned);
  }
  function fromValue(val, unsigned) {
    if (typeof val === "number") return fromNumber(val, unsigned);
    if (typeof val === "string") return fromString(val, unsigned);
    return fromBits(val.low, val.high, typeof unsigned === "boolean" ? unsigned : val.unsigned);
  }
  function isLong(obj) {
    return (obj && obj["__isLong__"]) === true;
  }

  // danmu-src/model.ts
  function encodePushFrame(message) {
    let bb = popByteBuffer();
    _encodePushFrame(message, bb);
    return toUint8Array(bb);
  }
  function _encodePushFrame(message, bb) {
    let $seqId = message.seqId;
    if ($seqId !== void 0) {
      writeVarint32(bb, 8);
      writeVarint64(bb, $seqId);
    }
    let $logId = message.logId;
    if ($logId !== void 0) {
      writeVarint32(bb, 16);
      writeVarint64(bb, $logId);
    }
    let $service = message.service;
    if ($service !== void 0) {
      writeVarint32(bb, 24);
      writeVarint64(bb, $service);
    }
    let $method = message.method;
    if ($method !== void 0) {
      writeVarint32(bb, 32);
      writeVarint64(bb, $method);
    }
    let map$headersList = message.headersList;
    if (map$headersList !== void 0) {
      for (let key in map$headersList) {
        let nested = popByteBuffer();
        let value = map$headersList[key];
        writeVarint32(nested, 10);
        writeString(nested, key);
        writeVarint32(nested, 18);
        writeString(nested, value);
        writeVarint32(bb, 42);
        writeVarint32(bb, nested.offset);
        writeByteBuffer(bb, nested);
        pushByteBuffer(nested);
      }
    }
    let $payloadEncoding = message.payloadEncoding;
    if ($payloadEncoding !== void 0) {
      writeVarint32(bb, 50);
      writeString(bb, $payloadEncoding);
    }
    let $payloadType = message.payloadType;
    if ($payloadType !== void 0) {
      writeVarint32(bb, 58);
      writeString(bb, $payloadType);
    }
    let $payload = message.payload;
    if ($payload !== void 0) {
      writeVarint32(bb, 66);
      writeVarint32(bb, $payload.length), writeBytes(bb, $payload);
    }
    let $lodIdNew = message.lodIdNew;
    if ($lodIdNew !== void 0) {
      writeVarint32(bb, 74);
      writeString(bb, $lodIdNew);
    }
  }
  function decodePushFrame(binary) {
    return _decodePushFrame(wrapByteBuffer(binary));
  }
  function _decodePushFrame(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional uint64 seqId = 1;
        case 1: {
          message.seqId = readVarint64(
            bb,
            /* unsigned */
            true
          );
          break;
        }
        // optional uint64 logId = 2;
        case 2: {
          message.logId = readVarint64(
            bb,
            /* unsigned */
            true
          );
          break;
        }
        // optional uint64 service = 3;
        case 3: {
          message.service = readVarint64(
            bb,
            /* unsigned */
            true
          );
          break;
        }
        // optional uint64 method = 4;
        case 4: {
          message.method = readVarint64(
            bb,
            /* unsigned */
            true
          );
          break;
        }
        // optional map<string, string> headersList = 5;
        case 5: {
          let values = message.headersList || (message.headersList = {});
          let outerLimit = pushTemporaryLength(bb);
          let key;
          let value;
          end_of_entry: while (!isAtEnd(bb)) {
            let tag2 = readVarint32(bb);
            switch (tag2 >>> 3) {
              case 0:
                break end_of_entry;
              case 1: {
                key = readString(bb, readVarint32(bb));
                break;
              }
              case 2: {
                value = readString(bb, readVarint32(bb));
                break;
              }
              default:
                skipUnknownField(bb, tag2 & 7);
            }
          }
          if (key === void 0 || value === void 0) throw new Error("Invalid data for map: headersList");
          values[key] = value;
          bb.limit = outerLimit;
          break;
        }
        // optional string payloadEncoding = 6;
        case 6: {
          message.payloadEncoding = readString(bb, readVarint32(bb));
          break;
        }
        // optional string payloadType = 7;
        case 7: {
          message.payloadType = readString(bb, readVarint32(bb));
          break;
        }
        // optional bytes payload = 8;
        case 8: {
          message.payload = readBytes(bb, readVarint32(bb));
          break;
        }
        // optional string lodIdNew = 9;
        case 9: {
          message.lodIdNew = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function decodeResponse(binary) {
    return _decodeResponse(wrapByteBuffer(binary));
  }
  function _decodeResponse(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // repeated Message messages = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          let values = message.messages || (message.messages = []);
          values.push(_decodeMessage(bb));
          bb.limit = limit;
          break;
        }
        // optional string cursor = 2;
        case 2: {
          message.cursor = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 fetchInterval = 3;
        case 3: {
          message.fetchInterval = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 now = 4;
        case 4: {
          message.now = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string internalExt = 5;
        case 5: {
          message.internalExt = readString(bb, readVarint32(bb));
          break;
        }
        // optional int32 fetchType = 6;
        case 6: {
          message.fetchType = readVarint32(bb);
          break;
        }
        // optional map<string, string> routeParams = 7;
        case 7: {
          let values = message.routeParams || (message.routeParams = {});
          let outerLimit = pushTemporaryLength(bb);
          let key;
          let value;
          end_of_entry: while (!isAtEnd(bb)) {
            let tag2 = readVarint32(bb);
            switch (tag2 >>> 3) {
              case 0:
                break end_of_entry;
              case 1: {
                key = readString(bb, readVarint32(bb));
                break;
              }
              case 2: {
                value = readString(bb, readVarint32(bb));
                break;
              }
              default:
                skipUnknownField(bb, tag2 & 7);
            }
          }
          if (key === void 0 || value === void 0) throw new Error("Invalid data for map: routeParams");
          values[key] = value;
          bb.limit = outerLimit;
          break;
        }
        // optional int64 heartbeatDuration = 8;
        case 8: {
          message.heartbeatDuration = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional bool needAck = 9;
        case 9: {
          message.needAck = !!readByte(bb);
          break;
        }
        // optional string pushServer = 10;
        case 10: {
          message.pushServer = readString(bb, readVarint32(bb));
          break;
        }
        // optional string liveCursor = 11;
        case 11: {
          message.liveCursor = readString(bb, readVarint32(bb));
          break;
        }
        // optional bool historyNoMore = 12;
        case 12: {
          message.historyNoMore = !!readByte(bb);
          break;
        }
        // optional string proxyServer = 13;
        case 13: {
          message.proxyServer = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeMessage(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional string method = 1;
        case 1: {
          message.method = readString(bb, readVarint32(bb));
          break;
        }
        // optional bytes payload = 2;
        case 2: {
          message.payload = readBytes(bb, readVarint32(bb));
          break;
        }
        // optional int64 msgId = 3;
        case 3: {
          message.msgId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int32 msgType = 4;
        case 4: {
          message.msgType = readVarint32(bb);
          break;
        }
        // optional int64 offset = 5;
        case 5: {
          message.offset = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional bool needWrdsStore = 6;
        case 6: {
          message.needWrdsStore = !!readByte(bb);
          break;
        }
        // optional int64 wrdsVersion = 7;
        case 7: {
          message.wrdsVersion = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string wrdsSubKey = 8;
        case 8: {
          message.wrdsSubKey = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function decodeChatMessage(binary) {
    return _decodeChatMessage(wrapByteBuffer(binary));
  }
  function _decodeChatMessage(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Common common = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.common = _decodeCommon(bb);
          bb.limit = limit;
          break;
        }
        // optional User user = 2;
        case 2: {
          let limit = pushTemporaryLength(bb);
          message.user = _decodeUser(bb);
          bb.limit = limit;
          break;
        }
        // optional string content = 3;
        case 3: {
          message.content = readString(bb, readVarint32(bb));
          break;
        }
        // optional bool visibleToSender = 4;
        case 4: {
          message.visibleToSender = !!readByte(bb);
          break;
        }
        // optional Image backgroundImage = 5;
        case 5: {
          let limit = pushTemporaryLength(bb);
          message.backgroundImage = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional string fullScreenTextColor = 6;
        case 6: {
          message.fullScreenTextColor = readString(bb, readVarint32(bb));
          break;
        }
        // optional Image backgroundImageV2 = 7;
        case 7: {
          let limit = pushTemporaryLength(bb);
          message.backgroundImageV2 = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional PublicAreaCommon publicAreaCommon = 9;
        case 9: {
          let limit = pushTemporaryLength(bb);
          message.publicAreaCommon = _decodePublicAreaCommon(bb);
          bb.limit = limit;
          break;
        }
        // optional Image giftImage = 10;
        case 10: {
          let limit = pushTemporaryLength(bb);
          message.giftImage = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 agreeMsgId = 11;
        case 11: {
          message.agreeMsgId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int32 priorityLevel = 12;
        case 12: {
          message.priorityLevel = readVarint32(bb);
          break;
        }
        // optional LandscapeAreaCommon landscapeAreaCommon = 13;
        case 13: {
          let limit = pushTemporaryLength(bb);
          message.landscapeAreaCommon = _decodeLandscapeAreaCommon(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 eventTime = 15;
        case 15: {
          message.eventTime = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional bool sendReview = 16;
        case 16: {
          message.sendReview = !!readByte(bb);
          break;
        }
        // optional bool fromIntercom = 17;
        case 17: {
          message.fromIntercom = !!readByte(bb);
          break;
        }
        // optional bool intercomHideUserCard = 18;
        case 18: {
          message.intercomHideUserCard = !!readByte(bb);
          break;
        }
        // optional int32 chatTags = 19;
        case 19: {
          message.chatTags = readVarint32(bb);
          break;
        }
        // optional int64 chatBy = 20;
        case 20: {
          message.chatBy = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int32 individualChatPriority = 21;
        case 21: {
          message.individualChatPriority = readVarint32(bb);
          break;
        }
        // optional Text rtfContent = 40;
        case 40: {
          let limit = pushTemporaryLength(bb);
          message.rtfContent = _decodeText(bb);
          bb.limit = limit;
          break;
        }
        // optional Text rtfContentV2 = 41;
        case 41: {
          let limit = pushTemporaryLength(bb);
          message.rtfContentV2 = _decodeText(bb);
          bb.limit = limit;
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function decodeEmojiChatMessage(binary) {
    return _decodeEmojiChatMessage(wrapByteBuffer(binary));
  }
  function _decodeEmojiChatMessage(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Common common = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.common = _decodeCommon(bb);
          bb.limit = limit;
          break;
        }
        // optional User user = 2;
        case 2: {
          let limit = pushTemporaryLength(bb);
          message.user = _decodeUser(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 emojiId = 3;
        case 3: {
          message.emojiId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional Text emojiContent = 4;
        case 4: {
          let limit = pushTemporaryLength(bb);
          message.emojiContent = _decodeText(bb);
          bb.limit = limit;
          break;
        }
        // optional string defaultContent = 5;
        case 5: {
          message.defaultContent = readString(bb, readVarint32(bb));
          break;
        }
        // optional Image backgroundImage = 6;
        case 6: {
          let limit = pushTemporaryLength(bb);
          message.backgroundImage = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional bool fromIntercom = 7;
        case 7: {
          message.fromIntercom = !!readByte(bb);
          break;
        }
        // optional bool intercomHideUserCard = 8;
        case 8: {
          message.intercomHideUserCard = !!readByte(bb);
          break;
        }
        // optional PublicAreaCommon publicAreaCommon = 9;
        case 9: {
          let limit = pushTemporaryLength(bb);
          message.publicAreaCommon = _decodePublicAreaCommon(bb);
          bb.limit = limit;
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function decodeRoomUserSeqMessage(binary) {
    return _decodeRoomUserSeqMessage(wrapByteBuffer(binary));
  }
  function _decodeRoomUserSeqMessage(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Common common = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.common = _decodeCommon(bb);
          bb.limit = limit;
          break;
        }
        // repeated RoomUserSeqMessage_Contributor ranks = 2;
        case 2: {
          let limit = pushTemporaryLength(bb);
          let values = message.ranks || (message.ranks = []);
          values.push(_decodeRoomUserSeqMessage_Contributor(bb));
          bb.limit = limit;
          break;
        }
        // optional int64 total = 3;
        case 3: {
          message.total = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string popStr = 4;
        case 4: {
          message.popStr = readString(bb, readVarint32(bb));
          break;
        }
        // repeated RoomUserSeqMessage_Contributor seats = 5;
        case 5: {
          let limit = pushTemporaryLength(bb);
          let values = message.seats || (message.seats = []);
          values.push(_decodeRoomUserSeqMessage_Contributor(bb));
          bb.limit = limit;
          break;
        }
        // optional int64 popularity = 6;
        case 6: {
          message.popularity = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 totalUser = 7;
        case 7: {
          message.totalUser = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string totalUserStr = 8;
        case 8: {
          message.totalUserStr = readString(bb, readVarint32(bb));
          break;
        }
        // optional string totalStr = 9;
        case 9: {
          message.totalStr = readString(bb, readVarint32(bb));
          break;
        }
        // optional string onlineUserForAnchor = 10;
        case 10: {
          message.onlineUserForAnchor = readString(bb, readVarint32(bb));
          break;
        }
        // optional string totalPvForAnchor = 11;
        case 11: {
          message.totalPvForAnchor = readString(bb, readVarint32(bb));
          break;
        }
        // optional string upRightStatsStr = 12;
        case 12: {
          message.upRightStatsStr = readString(bb, readVarint32(bb));
          break;
        }
        // optional string upRightStatsStrComplete = 13;
        case 13: {
          message.upRightStatsStrComplete = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeRoomUserSeqMessage_Contributor(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional int64 score = 1;
        case 1: {
          message.score = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional User user = 2;
        case 2: {
          let limit = pushTemporaryLength(bb);
          message.user = _decodeUser(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 rank = 3;
        case 3: {
          message.rank = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 delta = 4;
        case 4: {
          message.delta = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional bool isHidden = 5;
        case 5: {
          message.isHidden = !!readByte(bb);
          break;
        }
        // optional string scoreDescription = 6;
        case 6: {
          message.scoreDescription = readString(bb, readVarint32(bb));
          break;
        }
        // optional string exactlyScore = 7;
        case 7: {
          message.exactlyScore = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function decodeGiftMessage(binary) {
    return _decodeGiftMessage(wrapByteBuffer(binary));
  }
  function _decodeGiftMessage(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Common common = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.common = _decodeCommon(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 giftId = 2;
        case 2: {
          message.giftId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 fanTicketCount = 3;
        case 3: {
          message.fanTicketCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 groupCount = 4;
        case 4: {
          message.groupCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 repeatCount = 5;
        case 5: {
          message.repeatCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 comboCount = 6;
        case 6: {
          message.comboCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional User user = 7;
        case 7: {
          let limit = pushTemporaryLength(bb);
          message.user = _decodeUser(bb);
          bb.limit = limit;
          break;
        }
        // optional User toUser = 8;
        case 8: {
          let limit = pushTemporaryLength(bb);
          message.toUser = _decodeUser(bb);
          bb.limit = limit;
          break;
        }
        // optional int32 repeatEnd = 9;
        case 9: {
          message.repeatEnd = readVarint32(bb);
          break;
        }
        // optional GiftMessage_TextEffect textEffect = 10;
        case 10: {
          let limit = pushTemporaryLength(bb);
          message.textEffect = _decodeGiftMessage_TextEffect(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 groupId = 11;
        case 11: {
          message.groupId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 incomeTaskgifts = 12;
        case 12: {
          message.incomeTaskgifts = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 roomFanTicketCount = 13;
        case 13: {
          message.roomFanTicketCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional GiftIMPriority priority = 14;
        case 14: {
          let limit = pushTemporaryLength(bb);
          message.priority = _decodeGiftIMPriority(bb);
          bb.limit = limit;
          break;
        }
        // optional GiftStruct gift = 15;
        case 15: {
          let limit = pushTemporaryLength(bb);
          message.gift = _decodeGiftStruct(bb);
          bb.limit = limit;
          break;
        }
        // optional string logId = 16;
        case 16: {
          message.logId = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 sendType = 17;
        case 17: {
          message.sendType = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional PublicAreaCommon publicAreaCommon = 18;
        case 18: {
          let limit = pushTemporaryLength(bb);
          message.publicAreaCommon = _decodePublicAreaCommon(bb);
          bb.limit = limit;
          break;
        }
        // optional Text trayDisplayText = 19;
        case 19: {
          let limit = pushTemporaryLength(bb);
          message.trayDisplayText = _decodeText(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 bannedDisplayEffects = 20;
        case 20: {
          message.bannedDisplayEffects = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional GiftTrayInfo trayInfo = 21;
        case 21: {
          let limit = pushTemporaryLength(bb);
          message.trayInfo = _decodeGiftTrayInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional AssetEffectMixInfo assetEffectMixInfo = 24;
        case 24: {
          let limit = pushTemporaryLength(bb);
          message.assetEffectMixInfo = _decodeAssetEffectMixInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional bool displayForSelf = 25;
        case 25: {
          message.displayForSelf = !!readByte(bb);
          break;
        }
        // optional string interactGiftInfo = 26;
        case 26: {
          message.interactGiftInfo = readString(bb, readVarint32(bb));
          break;
        }
        // optional string diyItemInfo = 27;
        case 27: {
          message.diyItemInfo = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 minAssetSet = 28;
        case 28: {
          message.minAssetSet = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 totalCount = 29;
        case 29: {
          message.totalCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int32 clientGiftSource = 30;
        case 30: {
          message.clientGiftSource = readVarint32(bb);
          break;
        }
        // optional AnchorGiftData anchorGift = 31;
        case 31: {
          let limit = pushTemporaryLength(bb);
          message.anchorGift = _decodeAnchorGiftData(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 toUserIds = 32;
        case 32: {
          message.toUserIds = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 sendTime = 33;
        case 33: {
          message.sendTime = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 forceDisplayEffects = 34;
        case 34: {
          message.forceDisplayEffects = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string traceId = 35;
        case 35: {
          message.traceId = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 effectDisplayTs = 36;
        case 36: {
          message.effectDisplayTs = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional SendTogether sendTogether = 37;
        case 37: {
          let limit = pushTemporaryLength(bb);
          message.sendTogether = _decodeSendTogether(bb);
          bb.limit = limit;
          break;
        }
        // optional ExtraEffect extraEffect = 38;
        case 38: {
          let limit = pushTemporaryLength(bb);
          message.extraEffect = _decodeExtraEffect(bb);
          bb.limit = limit;
          break;
        }
        // optional RoomHotInfo roomHotInfo = 39;
        case 39: {
          let limit = pushTemporaryLength(bb);
          message.roomHotInfo = _decodeRoomHotInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional string GiftPlayParam = 40;
        case 40: {
          message.GiftPlayParam = readString(bb, readVarint32(bb));
          break;
        }
        // optional int32 multiSendEffectLevel = 41;
        case 41: {
          message.multiSendEffectLevel = readVarint32(bb);
          break;
        }
        // repeated SeriesPlayGift seriesGiftData = 42;
        case 42: {
          let limit = pushTemporaryLength(bb);
          let values = message.seriesGiftData || (message.seriesGiftData = []);
          values.push(_decodeSeriesPlayGift(bb));
          bb.limit = limit;
          break;
        }
        // optional bool useRoomMessage = 43;
        case 43: {
          message.useRoomMessage = !!readByte(bb);
          break;
        }
        // optional int64 count = 44;
        case 44: {
          message.count = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string toOpenids = 5000;
        case 5e3: {
          message.toOpenids = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeGiftMessage_TextEffect(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional GiftMessage_TextEffect_Detail portrait = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.portrait = _decodeGiftMessage_TextEffect_Detail(bb);
          bb.limit = limit;
          break;
        }
        // optional GiftMessage_TextEffect_Detail landscape = 2;
        case 2: {
          let limit = pushTemporaryLength(bb);
          message.landscape = _decodeGiftMessage_TextEffect_Detail(bb);
          bb.limit = limit;
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeGiftMessage_TextEffect_Detail(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Text text = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.text = _decodeText(bb);
          bb.limit = limit;
          break;
        }
        // optional int32 textFontSize = 2;
        case 2: {
          message.textFontSize = readVarint32(bb);
          break;
        }
        // optional Image background = 3;
        case 3: {
          let limit = pushTemporaryLength(bb);
          message.background = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional int32 start = 4;
        case 4: {
          message.start = readVarint32(bb);
          break;
        }
        // optional int32 duration = 5;
        case 5: {
          message.duration = readVarint32(bb);
          break;
        }
        // optional int32 x = 6;
        case 6: {
          message.x = readVarint32(bb);
          break;
        }
        // optional int32 y = 7;
        case 7: {
          message.y = readVarint32(bb);
          break;
        }
        // optional int32 width = 8;
        case 8: {
          message.width = readVarint32(bb);
          break;
        }
        // optional int32 height = 9;
        case 9: {
          message.height = readVarint32(bb);
          break;
        }
        // optional int32 shadowDx = 10;
        case 10: {
          message.shadowDx = readVarint32(bb);
          break;
        }
        // optional int32 shadowDy = 11;
        case 11: {
          message.shadowDy = readVarint32(bb);
          break;
        }
        // optional int32 shadowRadius = 12;
        case 12: {
          message.shadowRadius = readVarint32(bb);
          break;
        }
        // optional string shadowColor = 13;
        case 13: {
          message.shadowColor = readString(bb, readVarint32(bb));
          break;
        }
        // optional string strokeColor = 14;
        case 14: {
          message.strokeColor = readString(bb, readVarint32(bb));
          break;
        }
        // optional int32 strokeWidth = 15;
        case 15: {
          message.strokeWidth = readVarint32(bb);
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function decodeLikeMessage(binary) {
    return _decodeLikeMessage(wrapByteBuffer(binary));
  }
  function _decodeLikeMessage(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Common common = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.common = _decodeCommon(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 count = 2;
        case 2: {
          message.count = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 total = 3;
        case 3: {
          message.total = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 color = 4;
        case 4: {
          message.color = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional User user = 5;
        case 5: {
          let limit = pushTemporaryLength(bb);
          message.user = _decodeUser(bb);
          bb.limit = limit;
          break;
        }
        // optional string icon = 6;
        case 6: {
          message.icon = readString(bb, readVarint32(bb));
          break;
        }
        // optional DoubleLikeDetail doubleLikeDetail = 7;
        case 7: {
          let limit = pushTemporaryLength(bb);
          message.doubleLikeDetail = _decodeDoubleLikeDetail(bb);
          bb.limit = limit;
          break;
        }
        // optional DisplayControlInfo displayControlInfo = 8;
        case 8: {
          let limit = pushTemporaryLength(bb);
          message.displayControlInfo = _decodeDisplayControlInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 linkmicGuestUid = 9;
        case 9: {
          message.linkmicGuestUid = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string scene = 10;
        case 10: {
          message.scene = readString(bb, readVarint32(bb));
          break;
        }
        // optional PicoDisplayInfo picoDisplayInfo = 11;
        case 11: {
          let limit = pushTemporaryLength(bb);
          message.picoDisplayInfo = _decodePicoDisplayInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional PublicAreaCommon publicAreaCommon = 12;
        case 12: {
          let limit = pushTemporaryLength(bb);
          message.publicAreaCommon = _decodePublicAreaCommon(bb);
          bb.limit = limit;
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function decodeSocialMessage(binary) {
    return _decodeSocialMessage(wrapByteBuffer(binary));
  }
  function _decodeSocialMessage(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Common common = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.common = _decodeCommon(bb);
          bb.limit = limit;
          break;
        }
        // optional User user = 2;
        case 2: {
          let limit = pushTemporaryLength(bb);
          message.user = _decodeUser(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 shareType = 3;
        case 3: {
          message.shareType = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 action = 4;
        case 4: {
          message.action = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string shareTarget = 5;
        case 5: {
          message.shareTarget = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 followCount = 6;
        case 6: {
          message.followCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional PublicAreaCommon publicAreaCommon = 7;
        case 7: {
          let limit = pushTemporaryLength(bb);
          message.publicAreaCommon = _decodePublicAreaCommon(bb);
          bb.limit = limit;
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function decodeMemberMessage(binary) {
    return _decodeMemberMessage(wrapByteBuffer(binary));
  }
  function _decodeMemberMessage(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Common common = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.common = _decodeCommon(bb);
          bb.limit = limit;
          break;
        }
        // optional User user = 2;
        case 2: {
          let limit = pushTemporaryLength(bb);
          message.user = _decodeUser(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 memberCount = 3;
        case 3: {
          message.memberCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional User operator = 4;
        case 4: {
          let limit = pushTemporaryLength(bb);
          message.operator = _decodeUser(bb);
          bb.limit = limit;
          break;
        }
        // optional bool isSetToAdmin = 5;
        case 5: {
          message.isSetToAdmin = !!readByte(bb);
          break;
        }
        // optional bool isTopUser = 6;
        case 6: {
          message.isTopUser = !!readByte(bb);
          break;
        }
        // optional int64 rankScore = 7;
        case 7: {
          message.rankScore = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 topUserNo = 8;
        case 8: {
          message.topUserNo = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 enterType = 9;
        case 9: {
          message.enterType = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 action = 10;
        case 10: {
          message.action = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string actionDescription = 11;
        case 11: {
          message.actionDescription = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 userId = 12;
        case 12: {
          message.userId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional MemberMessage_EffectConfig effectConfig = 13;
        case 13: {
          let limit = pushTemporaryLength(bb);
          message.effectConfig = _decodeMemberMessage_EffectConfig(bb);
          bb.limit = limit;
          break;
        }
        // optional string popStr = 14;
        case 14: {
          message.popStr = readString(bb, readVarint32(bb));
          break;
        }
        // optional MemberMessage_EffectConfig enterEffectConfig = 15;
        case 15: {
          let limit = pushTemporaryLength(bb);
          message.enterEffectConfig = _decodeMemberMessage_EffectConfig(bb);
          bb.limit = limit;
          break;
        }
        // optional Image backgroundImage = 16;
        case 16: {
          let limit = pushTemporaryLength(bb);
          message.backgroundImage = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image backgroundImageV2 = 17;
        case 17: {
          let limit = pushTemporaryLength(bb);
          message.backgroundImageV2 = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Text anchorDisplayText = 18;
        case 18: {
          let limit = pushTemporaryLength(bb);
          message.anchorDisplayText = _decodeText(bb);
          bb.limit = limit;
          break;
        }
        // optional PublicAreaCommon publicAreaCommon = 19;
        case 19: {
          let limit = pushTemporaryLength(bb);
          message.publicAreaCommon = _decodePublicAreaCommon(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 userEnterTipType = 20;
        case 20: {
          message.userEnterTipType = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 anchorEnterTipType = 21;
        case 21: {
          message.anchorEnterTipType = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional MemberMessage_PicoEffectConfig picoEnterEffectConfig = 24;
        case 24: {
          let limit = pushTemporaryLength(bb);
          message.picoEnterEffectConfig = _decodeMemberMessage_PicoEffectConfig(bb);
          bb.limit = limit;
          break;
        }
        // optional string userOpenId = 5000;
        case 5e3: {
          message.userOpenId = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeMemberMessage_EffectConfig(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional int64 type = 1;
        case 1: {
          message.type = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional Image icon = 2;
        case 2: {
          let limit = pushTemporaryLength(bb);
          message.icon = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 avatarPos = 3;
        case 3: {
          message.avatarPos = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional Text text = 4;
        case 4: {
          let limit = pushTemporaryLength(bb);
          message.text = _decodeText(bb);
          bb.limit = limit;
          break;
        }
        // optional Image textIcon = 5;
        case 5: {
          let limit = pushTemporaryLength(bb);
          message.textIcon = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional int32 stayTime = 6;
        case 6: {
          message.stayTime = readVarint32(bb);
          break;
        }
        // optional int64 animAssetId = 7;
        case 7: {
          message.animAssetId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional Image badge = 8;
        case 8: {
          let limit = pushTemporaryLength(bb);
          message.badge = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // repeated int64 flexSettingArray = 9;
        case 9: {
          let values = message.flexSettingArray || (message.flexSettingArray = []);
          if ((tag & 7) === 2) {
            let outerLimit = pushTemporaryLength(bb);
            while (!isAtEnd(bb)) {
              values.push(readVarint64(
                bb,
                /* unsigned */
                false
              ));
            }
            bb.limit = outerLimit;
          } else {
            values.push(readVarint64(
              bb,
              /* unsigned */
              false
            ));
          }
          break;
        }
        // optional Image textIconOverlay = 10;
        case 10: {
          let limit = pushTemporaryLength(bb);
          message.textIconOverlay = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image animatedBadge = 11;
        case 11: {
          let limit = pushTemporaryLength(bb);
          message.animatedBadge = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional bool hasSweepLight = 12;
        case 12: {
          message.hasSweepLight = !!readByte(bb);
          break;
        }
        // repeated int64 textFlexSettingArray = 13;
        case 13: {
          let values = message.textFlexSettingArray || (message.textFlexSettingArray = []);
          if ((tag & 7) === 2) {
            let outerLimit = pushTemporaryLength(bb);
            while (!isAtEnd(bb)) {
              values.push(readVarint64(
                bb,
                /* unsigned */
                false
              ));
            }
            bb.limit = outerLimit;
          } else {
            values.push(readVarint64(
              bb,
              /* unsigned */
              false
            ));
          }
          break;
        }
        // optional int64 centerAnimAssetId = 14;
        case 14: {
          message.centerAnimAssetId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeMemberMessage_PicoEffectConfig(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional int64 type = 1;
        case 1: {
          message.type = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional Image icon = 2;
        case 2: {
          let limit = pushTemporaryLength(bb);
          message.icon = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Text text = 3;
        case 3: {
          let limit = pushTemporaryLength(bb);
          message.text = _decodeText(bb);
          bb.limit = limit;
          break;
        }
        // optional Image textIcon = 4;
        case 4: {
          let limit = pushTemporaryLength(bb);
          message.textIcon = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional int32 stayTime = 5;
        case 5: {
          message.stayTime = readVarint32(bb);
          break;
        }
        // optional Image badge = 6;
        case 6: {
          let limit = pushTemporaryLength(bb);
          message.badge = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 centerAnimAssetId = 7;
        case 7: {
          message.centerAnimAssetId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string dressId = 9;
        case 9: {
          message.dressId = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function decodeControlMessage(binary) {
    return _decodeControlMessage(wrapByteBuffer(binary));
  }
  function _decodeControlMessage(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Common common = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.common = _decodeCommon(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 action = 2;
        case 2: {
          message.action = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string tips = 3;
        case 3: {
          message.tips = readString(bb, readVarint32(bb));
          break;
        }
        // optional ControlMessage_Extra extra = 4;
        case 4: {
          let limit = pushTemporaryLength(bb);
          message.extra = _decodeControlMessage_Extra(bb);
          bb.limit = limit;
          break;
        }
        // optional PublicAreaCommon publicAreaCommon = 5;
        case 5: {
          let limit = pushTemporaryLength(bb);
          message.publicAreaCommon = _decodePublicAreaCommon(bb);
          bb.limit = limit;
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeControlMessage_Extra(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional string banInfoUrl = 1;
        case 1: {
          message.banInfoUrl = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 reasonNo = 2;
        case 2: {
          message.reasonNo = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional Text title = 3;
        case 3: {
          let limit = pushTemporaryLength(bb);
          message.title = _decodeText(bb);
          bb.limit = limit;
          break;
        }
        // optional Text violationReason = 4;
        case 4: {
          let limit = pushTemporaryLength(bb);
          message.violationReason = _decodeText(bb);
          bb.limit = limit;
          break;
        }
        // optional Text content = 5;
        case 5: {
          let limit = pushTemporaryLength(bb);
          message.content = _decodeText(bb);
          bb.limit = limit;
          break;
        }
        // optional Text gotItButton = 6;
        case 6: {
          let limit = pushTemporaryLength(bb);
          message.gotItButton = _decodeText(bb);
          bb.limit = limit;
          break;
        }
        // optional Text banDetailButton = 7;
        case 7: {
          let limit = pushTemporaryLength(bb);
          message.banDetailButton = _decodeText(bb);
          bb.limit = limit;
          break;
        }
        // optional string source = 8;
        case 8: {
          message.source = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function decodeRoomStatsMessage(binary) {
    return _decodeRoomStatsMessage(wrapByteBuffer(binary));
  }
  function _decodeRoomStatsMessage(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Common common = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.common = _decodeCommon(bb);
          bb.limit = limit;
          break;
        }
        // optional string displayShort = 2;
        case 2: {
          message.displayShort = readString(bb, readVarint32(bb));
          break;
        }
        // optional string displayMiddle = 3;
        case 3: {
          message.displayMiddle = readString(bb, readVarint32(bb));
          break;
        }
        // optional string displayLong = 4;
        case 4: {
          message.displayLong = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 displayValue = 5;
        case 5: {
          message.displayValue = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 displayVersion = 6;
        case 6: {
          message.displayVersion = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional bool incremental = 7;
        case 7: {
          message.incremental = !!readByte(bb);
          break;
        }
        // optional bool isHidden = 8;
        case 8: {
          message.isHidden = !!readByte(bb);
          break;
        }
        // optional int64 total = 9;
        case 9: {
          message.total = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 displayType = 10;
        case 10: {
          message.displayType = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function decodeRoomRankMessage(binary) {
    return _decodeRoomRankMessage(wrapByteBuffer(binary));
  }
  function _decodeRoomRankMessage(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Common common = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.common = _decodeCommon(bb);
          bb.limit = limit;
          break;
        }
        // repeated RoomRankMessage_RoomRank ranks = 2;
        case 2: {
          let limit = pushTemporaryLength(bb);
          let values = message.ranks || (message.ranks = []);
          values.push(_decodeRoomRankMessage_RoomRank(bb));
          bb.limit = limit;
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeRoomRankMessage_RoomRank(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional User user = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.user = _decodeUser(bb);
          bb.limit = limit;
          break;
        }
        // optional string scoreStr = 2;
        case 2: {
          message.scoreStr = readString(bb, readVarint32(bb));
          break;
        }
        // optional bool profileHidden = 3;
        case 3: {
          message.profileHidden = !!readByte(bb);
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeCommon(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional string method = 1;
        case 1: {
          message.method = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 msgId = 2;
        case 2: {
          message.msgId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 roomId = 3;
        case 3: {
          message.roomId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 createTime = 4;
        case 4: {
          message.createTime = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int32 monitor = 5;
        case 5: {
          message.monitor = readVarint32(bb);
          break;
        }
        // optional bool isShowMsg = 6;
        case 6: {
          message.isShowMsg = !!readByte(bb);
          break;
        }
        // optional string describe = 7;
        case 7: {
          message.describe = readString(bb, readVarint32(bb));
          break;
        }
        // optional Text displayText = 8;
        case 8: {
          let limit = pushTemporaryLength(bb);
          message.displayText = _decodeText(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 foldType = 9;
        case 9: {
          message.foldType = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 anchorFoldType = 10;
        case 10: {
          message.anchorFoldType = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 priorityScore = 11;
        case 11: {
          message.priorityScore = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string logId = 12;
        case 12: {
          message.logId = readString(bb, readVarint32(bb));
          break;
        }
        // optional string msgProcessFilterK = 13;
        case 13: {
          message.msgProcessFilterK = readString(bb, readVarint32(bb));
          break;
        }
        // optional string msgProcessFilterV = 14;
        case 14: {
          message.msgProcessFilterV = readString(bb, readVarint32(bb));
          break;
        }
        // optional User user = 15;
        case 15: {
          let limit = pushTemporaryLength(bb);
          message.user = _decodeUser(bb);
          bb.limit = limit;
          break;
        }
        // optional Room room = 16;
        case 16: {
          let limit = pushTemporaryLength(bb);
          message.room = _decodeRoom(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 anchorFoldTypeV2 = 17;
        case 17: {
          message.anchorFoldTypeV2 = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 processAtSeiTimeMs = 18;
        case 18: {
          message.processAtSeiTimeMs = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 randomDispatchMs = 19;
        case 19: {
          message.randomDispatchMs = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional bool isDispatch = 20;
        case 20: {
          message.isDispatch = !!readByte(bb);
          break;
        }
        // optional int64 channelId = 21;
        case 21: {
          message.channelId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 diffSei2absSecond = 22;
        case 22: {
          message.diffSei2absSecond = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 anchorFoldDuration = 23;
        case 23: {
          message.anchorFoldDuration = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 appId = 24;
        case 24: {
          message.appId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeDoubleLikeDetail(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional bool doubleFlag = 1;
        case 1: {
          message.doubleFlag = !!readByte(bb);
          break;
        }
        // optional int32 seqId = 2;
        case 2: {
          message.seqId = readVarint32(bb);
          break;
        }
        // optional int32 renewalsNum = 3;
        case 3: {
          message.renewalsNum = readVarint32(bb);
          break;
        }
        // optional int32 triggersNum = 4;
        case 4: {
          message.triggersNum = readVarint32(bb);
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeDisplayControlInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional bool showText = 1;
        case 1: {
          message.showText = !!readByte(bb);
          break;
        }
        // optional bool showIcons = 2;
        case 2: {
          message.showIcons = !!readByte(bb);
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeLandscapeAreaCommon(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional bool showHead = 1;
        case 1: {
          message.showHead = !!readByte(bb);
          break;
        }
        // optional bool showNickname = 2;
        case 2: {
          message.showNickname = !!readByte(bb);
          break;
        }
        // optional bool showFontColor = 3;
        case 3: {
          message.showFontColor = !!readByte(bb);
          break;
        }
        // optional string colorValue = 4;
        case 4: {
          message.colorValue = readString(bb, readVarint32(bb));
          break;
        }
        // optional int32 commentTypeTags = 5;
        case 5: {
          message.commentTypeTags = readVarint32(bb);
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodePicoDisplayInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional int64 comboSumCount = 1;
        case 1: {
          message.comboSumCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string emoji = 2;
        case 2: {
          message.emoji = readString(bb, readVarint32(bb));
          break;
        }
        // optional Image emojiIcon = 3;
        case 3: {
          let limit = pushTemporaryLength(bb);
          message.emojiIcon = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional string emojiText = 4;
        case 4: {
          message.emojiText = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeRoomHotInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional int32 localHotStrategy = 1;
        case 1: {
          message.localHotStrategy = readVarint32(bb);
          break;
        }
        // optional int32 publicAreaLevel = 2;
        case 2: {
          message.publicAreaLevel = readVarint32(bb);
          break;
        }
        // optional int32 giftLevel = 3;
        case 3: {
          message.giftLevel = readVarint32(bb);
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeText(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional string key = 1;
        case 1: {
          message.key = readString(bb, readVarint32(bb));
          break;
        }
        // optional string defaultPattern = 2;
        case 2: {
          message.defaultPattern = readString(bb, readVarint32(bb));
          break;
        }
        // optional TextFormat defaultFormat = 3;
        case 3: {
          let limit = pushTemporaryLength(bb);
          message.defaultFormat = _decodeTextFormat(bb);
          bb.limit = limit;
          break;
        }
        // repeated TextPiece pieces = 4;
        case 4: {
          let limit = pushTemporaryLength(bb);
          let values = message.pieces || (message.pieces = []);
          values.push(_decodeTextPiece(bb));
          bb.limit = limit;
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeRoom(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional int64 id = 1;
        case 1: {
          message.id = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string idStr = 2;
        case 2: {
          message.idStr = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 status = 3;
        case 3: {
          message.status = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 ownerUserId = 4;
        case 4: {
          message.ownerUserId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string title = 5;
        case 5: {
          message.title = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 userCount = 6;
        case 6: {
          message.userCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 createTime = 7;
        case 7: {
          message.createTime = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 linkmicLayout = 8;
        case 8: {
          message.linkmicLayout = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 finishTime = 9;
        case 9: {
          message.finishTime = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional RoomExtra extra = 10;
        case 10: {
          let limit = pushTemporaryLength(bb);
          message.extra = _decodeRoomExtra(bb);
          bb.limit = limit;
          break;
        }
        // optional string dynamicCoverUri = 11;
        case 11: {
          message.dynamicCoverUri = readString(bb, readVarint32(bb));
          break;
        }
        // optional map<int64, string> dynamicCoverDict = 12;
        case 12: {
          let values = message.dynamicCoverDict || (message.dynamicCoverDict = {});
          let outerLimit = pushTemporaryLength(bb);
          let key;
          let value;
          end_of_entry: while (!isAtEnd(bb)) {
            let tag2 = readVarint32(bb);
            switch (tag2 >>> 3) {
              case 0:
                break end_of_entry;
              case 1: {
                key = readVarint64(
                  bb,
                  /* unsigned */
                  false
                );
                break;
              }
              case 2: {
                value = readString(bb, readVarint32(bb));
                break;
              }
              default:
                skipUnknownField(bb, tag2 & 7);
            }
          }
          if (key === void 0 || value === void 0) throw new Error("Invalid data for map: dynamicCoverDict");
          values[key] = value;
          bb.limit = outerLimit;
          break;
        }
        // optional int64 lastPingTime = 13;
        case 13: {
          message.lastPingTime = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 liveId = 14;
        case 14: {
          message.liveId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 streamProvider = 15;
        case 15: {
          message.streamProvider = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 osType = 16;
        case 16: {
          message.osType = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 clientVersion = 17;
        case 17: {
          message.clientVersion = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional bool withLinkmic = 18;
        case 18: {
          message.withLinkmic = !!readByte(bb);
          break;
        }
        // optional bool enableRoomPerspective = 19;
        case 19: {
          message.enableRoomPerspective = !!readByte(bb);
          break;
        }
        // optional Image cover = 20;
        case 20: {
          let limit = pushTemporaryLength(bb);
          message.cover = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image dynamicCover = 21;
        case 21: {
          let limit = pushTemporaryLength(bb);
          message.dynamicCover = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image dynamicCoverLow = 22;
        case 22: {
          let limit = pushTemporaryLength(bb);
          message.dynamicCoverLow = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional string shareUrl = 23;
        case 23: {
          message.shareUrl = readString(bb, readVarint32(bb));
          break;
        }
        // optional string anchorShareText = 24;
        case 24: {
          message.anchorShareText = readString(bb, readVarint32(bb));
          break;
        }
        // optional string userShareText = 25;
        case 25: {
          message.userShareText = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 streamId = 26;
        case 26: {
          message.streamId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string streamIdStr = 27;
        case 27: {
          message.streamIdStr = readString(bb, readVarint32(bb));
          break;
        }
        // optional StreamUrl streamUrl = 28;
        case 28: {
          let limit = pushTemporaryLength(bb);
          message.streamUrl = _decodeStreamUrl(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 mosaicStatus = 29;
        case 29: {
          message.mosaicStatus = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string mosaicTip = 30;
        case 30: {
          message.mosaicTip = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 cellStyle = 31;
        case 31: {
          message.cellStyle = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional LinkMic linkMic = 32;
        case 32: {
          let limit = pushTemporaryLength(bb);
          message.linkMic = _decodeLinkMic(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 luckymoneyNum = 33;
        case 33: {
          message.luckymoneyNum = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // repeated Decoration decoList = 34;
        case 34: {
          let limit = pushTemporaryLength(bb);
          let values = message.decoList || (message.decoList = []);
          values.push(_decodeDecoration(bb));
          bb.limit = limit;
          break;
        }
        // repeated TopFan topFans = 35;
        case 35: {
          let limit = pushTemporaryLength(bb);
          let values = message.topFans || (message.topFans = []);
          values.push(_decodeTopFan(bb));
          bb.limit = limit;
          break;
        }
        // optional RoomStats stats = 36;
        case 36: {
          let limit = pushTemporaryLength(bb);
          message.stats = _decodeRoomStats(bb);
          bb.limit = limit;
          break;
        }
        // optional string sunDailyIconContent = 37;
        case 37: {
          message.sunDailyIconContent = readString(bb, readVarint32(bb));
          break;
        }
        // optional string distance = 38;
        case 38: {
          message.distance = readString(bb, readVarint32(bb));
          break;
        }
        // optional string distanceCity = 39;
        case 39: {
          message.distanceCity = readString(bb, readVarint32(bb));
          break;
        }
        // optional string location = 40;
        case 40: {
          message.location = readString(bb, readVarint32(bb));
          break;
        }
        // optional string realDistance = 41;
        case 41: {
          message.realDistance = readString(bb, readVarint32(bb));
          break;
        }
        // optional Image feedRoomLabel = 42;
        case 42: {
          let limit = pushTemporaryLength(bb);
          message.feedRoomLabel = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional string commonLabelList = 43;
        case 43: {
          message.commonLabelList = readString(bb, readVarint32(bb));
          break;
        }
        // optional RoomUserAttr livingRoomAttrs = 44;
        case 44: {
          let limit = pushTemporaryLength(bb);
          message.livingRoomAttrs = _decodeRoomUserAttr(bb);
          bb.limit = limit;
          break;
        }
        // repeated int64 adminUserIds = 45;
        case 45: {
          let values = message.adminUserIds || (message.adminUserIds = []);
          if ((tag & 7) === 2) {
            let outerLimit = pushTemporaryLength(bb);
            while (!isAtEnd(bb)) {
              values.push(readVarint64(
                bb,
                /* unsigned */
                false
              ));
            }
            bb.limit = outerLimit;
          } else {
            values.push(readVarint64(
              bb,
              /* unsigned */
              false
            ));
          }
          break;
        }
        // optional User owner = 46;
        case 46: {
          let limit = pushTemporaryLength(bb);
          message.owner = _decodeUser(bb);
          bb.limit = limit;
          break;
        }
        // optional string privateInfo = 47;
        case 47: {
          message.privateInfo = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeRoomExtra(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeRoomStats(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional int64 id = 1;
        case 1: {
          message.id = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string idStr = 2;
        case 2: {
          message.idStr = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 fanTicket = 3;
        case 3: {
          message.fanTicket = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 money = 4;
        case 4: {
          message.money = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 totalUser = 5;
        case 5: {
          message.totalUser = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 giftUvCount = 6;
        case 6: {
          message.giftUvCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 followCount = 7;
        case 7: {
          message.followCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional RoomStats_UserCountComposition userCountComposition = 8;
        case 8: {
          let limit = pushTemporaryLength(bb);
          message.userCountComposition = _decodeRoomStats_UserCountComposition(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 watermelon = 9;
        case 9: {
          message.watermelon = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 diggCount = 10;
        case 10: {
          message.diggCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 enterCount = 11;
        case 11: {
          message.enterCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string douPlusPromotion = 12;
        case 12: {
          message.douPlusPromotion = readString(bb, readVarint32(bb));
          break;
        }
        // optional string totalUserDesp = 13;
        case 13: {
          message.totalUserDesp = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 likeCount = 14;
        case 14: {
          message.likeCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string totalUserStr = 15;
        case 15: {
          message.totalUserStr = readString(bb, readVarint32(bb));
          break;
        }
        // optional string userCountStr = 16;
        case 16: {
          message.userCountStr = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 commentCount = 17;
        case 17: {
          message.commentCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 welfareDonationAmount = 18;
        case 18: {
          message.welfareDonationAmount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string upRightStatsStr = 19;
        case 19: {
          message.upRightStatsStr = readString(bb, readVarint32(bb));
          break;
        }
        // optional string upRightStatsStrComplete = 20;
        case 20: {
          message.upRightStatsStrComplete = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeRoomStats_UserCountComposition(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeRoomUserAttr(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeStreamUrl(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeLinkMic(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeDecoration(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeTopFan(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional int64 id = 1;
        case 1: {
          message.id = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 shortId = 2;
        case 2: {
          message.shortId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string nickname = 3;
        case 3: {
          message.nickname = readString(bb, readVarint32(bb));
          break;
        }
        // optional int32 gender = 4;
        case 4: {
          message.gender = readVarint32(bb);
          break;
        }
        // optional string signature = 5;
        case 5: {
          message.signature = readString(bb, readVarint32(bb));
          break;
        }
        // optional int32 level = 6;
        case 6: {
          message.level = readVarint32(bb);
          break;
        }
        // optional int64 birthday = 7;
        case 7: {
          message.birthday = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string telephone = 8;
        case 8: {
          message.telephone = readString(bb, readVarint32(bb));
          break;
        }
        // optional Image avatarThumb = 9;
        case 9: {
          let limit = pushTemporaryLength(bb);
          message.avatarThumb = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image avatarMedium = 10;
        case 10: {
          let limit = pushTemporaryLength(bb);
          message.avatarMedium = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image avatarLarge = 11;
        case 11: {
          let limit = pushTemporaryLength(bb);
          message.avatarLarge = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional bool verified = 12;
        case 12: {
          message.verified = !!readByte(bb);
          break;
        }
        // optional int32 experience = 13;
        case 13: {
          message.experience = readVarint32(bb);
          break;
        }
        // optional string city = 14;
        case 14: {
          message.city = readString(bb, readVarint32(bb));
          break;
        }
        // optional int32 status = 15;
        case 15: {
          message.status = readVarint32(bb);
          break;
        }
        // optional int64 createTime = 16;
        case 16: {
          message.createTime = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 modifyTime = 17;
        case 17: {
          message.modifyTime = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int32 secret = 18;
        case 18: {
          message.secret = readVarint32(bb);
          break;
        }
        // optional string shareQrcodeUri = 19;
        case 19: {
          message.shareQrcodeUri = readString(bb, readVarint32(bb));
          break;
        }
        // optional int32 incomeSharePercent = 20;
        case 20: {
          message.incomeSharePercent = readVarint32(bb);
          break;
        }
        // optional Image badgeImageList = 21;
        case 21: {
          let limit = pushTemporaryLength(bb);
          message.badgeImageList = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional User_FollowInfo followInfo = 22;
        case 22: {
          let limit = pushTemporaryLength(bb);
          message.followInfo = _decodeUser_FollowInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional User_PayGrade payGrade = 23;
        case 23: {
          let limit = pushTemporaryLength(bb);
          message.payGrade = _decodeUser_PayGrade(bb);
          bb.limit = limit;
          break;
        }
        // optional User_FansClub fansClub = 24;
        case 24: {
          let limit = pushTemporaryLength(bb);
          message.fansClub = _decodeUser_FansClub(bb);
          bb.limit = limit;
          break;
        }
        // optional User_Border border = 25;
        case 25: {
          let limit = pushTemporaryLength(bb);
          message.border = _decodeUser_Border(bb);
          bb.limit = limit;
          break;
        }
        // optional string specialId = 26;
        case 26: {
          message.specialId = readString(bb, readVarint32(bb));
          break;
        }
        // optional Image avatarBorder = 27;
        case 27: {
          let limit = pushTemporaryLength(bb);
          message.avatarBorder = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image medal = 28;
        case 28: {
          let limit = pushTemporaryLength(bb);
          message.medal = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // repeated Image realTimeIcons = 29;
        case 29: {
          let limit = pushTemporaryLength(bb);
          let values = message.realTimeIcons || (message.realTimeIcons = []);
          values.push(_decodeImage(bb));
          bb.limit = limit;
          break;
        }
        // repeated Image newRealTimeIcons = 30;
        case 30: {
          let limit = pushTemporaryLength(bb);
          let values = message.newRealTimeIcons || (message.newRealTimeIcons = []);
          values.push(_decodeImage(bb));
          bb.limit = limit;
          break;
        }
        // optional int64 topVipNo = 31;
        case 31: {
          message.topVipNo = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional User_UserAttr userAttr = 32;
        case 32: {
          let limit = pushTemporaryLength(bb);
          message.userAttr = _decodeUser_UserAttr(bb);
          bb.limit = limit;
          break;
        }
        // optional User_OwnRoom ownRoom = 33;
        case 33: {
          let limit = pushTemporaryLength(bb);
          message.ownRoom = _decodeUser_OwnRoom(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 payScore = 34;
        case 34: {
          message.payScore = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 ticketCount = 35;
        case 35: {
          message.ticketCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional User_AnchorInfo anchorInfo = 36;
        case 36: {
          let limit = pushTemporaryLength(bb);
          message.anchorInfo = _decodeUser_AnchorInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional int32 linkMicStats = 37;
        case 37: {
          message.linkMicStats = readVarint32(bb);
          break;
        }
        // optional string displayId = 38;
        case 38: {
          message.displayId = readString(bb, readVarint32(bb));
          break;
        }
        // optional bool withCommercePermission = 39;
        case 39: {
          message.withCommercePermission = !!readByte(bb);
          break;
        }
        // optional bool withFusionShopEntry = 40;
        case 40: {
          message.withFusionShopEntry = !!readByte(bb);
          break;
        }
        // optional int64 totalRechargeDiamondCount = 41;
        case 41: {
          message.totalRechargeDiamondCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional User_AnchorLevel webcastAnchorLevel = 42;
        case 42: {
          let limit = pushTemporaryLength(bb);
          message.webcastAnchorLevel = _decodeUser_AnchorLevel(bb);
          bb.limit = limit;
          break;
        }
        // optional string verifiedContent = 43;
        case 43: {
          message.verifiedContent = readString(bb, readVarint32(bb));
          break;
        }
        // optional User_AuthorStats authorStats = 44;
        case 44: {
          let limit = pushTemporaryLength(bb);
          message.authorStats = _decodeUser_AuthorStats(bb);
          bb.limit = limit;
          break;
        }
        // optional User topFans = 45;
        case 45: {
          let limit = pushTemporaryLength(bb);
          message.topFans = _decodeUser(bb);
          bb.limit = limit;
          break;
        }
        // optional string secUid = 46;
        case 46: {
          message.secUid = readString(bb, readVarint32(bb));
          break;
        }
        // optional int32 userRole = 47;
        case 47: {
          message.userRole = readVarint32(bb);
          break;
        }
        // optional User_XiguaParams xiguaInfo = 48;
        case 48: {
          let limit = pushTemporaryLength(bb);
          message.xiguaInfo = _decodeUser_XiguaParams(bb);
          bb.limit = limit;
          break;
        }
        // optional User_ActivityInfo activityReward = 49;
        case 49: {
          let limit = pushTemporaryLength(bb);
          message.activityReward = _decodeUser_ActivityInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional User_NobleLevelInfo nobleInfo = 50;
        case 50: {
          let limit = pushTemporaryLength(bb);
          message.nobleInfo = _decodeUser_NobleLevelInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional User_BrotherhoodInfo brotherhoodInfo = 51;
        case 51: {
          let limit = pushTemporaryLength(bb);
          message.brotherhoodInfo = _decodeUser_BrotherhoodInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional Image personalCard = 52;
        case 52: {
          let limit = pushTemporaryLength(bb);
          message.personalCard = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional User_AuthenticationInfo authenticationInfo = 53;
        case 53: {
          let limit = pushTemporaryLength(bb);
          message.authenticationInfo = _decodeUser_AuthenticationInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional int32 authorizationInfo = 54;
        case 54: {
          message.authorizationInfo = readVarint32(bb);
          break;
        }
        // optional int32 adversaryAuthorizationInfo = 55;
        case 55: {
          message.adversaryAuthorizationInfo = readVarint32(bb);
          break;
        }
        // optional User_PoiInfo poiInfo = 56;
        case 56: {
          let limit = pushTemporaryLength(bb);
          message.poiInfo = _decodeUser_PoiInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional Image mediaBadgeImageList = 57;
        case 57: {
          let limit = pushTemporaryLength(bb);
          message.mediaBadgeImageList = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional int32 adversaryUserStatus = 58;
        case 58: {
          message.adversaryUserStatus = readVarint32(bb);
          break;
        }
        // optional UserVIPInfo userVipInfo = 59;
        case 59: {
          let limit = pushTemporaryLength(bb);
          message.userVipInfo = _decodeUserVIPInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 commerceWebcastConfigIds = 60;
        case 60: {
          message.commerceWebcastConfigIds = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional Image badgeImageListV2 = 61;
        case 61: {
          let limit = pushTemporaryLength(bb);
          message.badgeImageListV2 = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional IndustryCertification industryCertification = 62;
        case 62: {
          let limit = pushTemporaryLength(bb);
          message.industryCertification = _decodeIndustryCertification(bb);
          bb.limit = limit;
          break;
        }
        // optional string locationCity = 63;
        case 63: {
          message.locationCity = readString(bb, readVarint32(bb));
          break;
        }
        // optional User_FansGroupInfo fansGroupInfo = 64;
        case 64: {
          let limit = pushTemporaryLength(bb);
          message.fansGroupInfo = _decodeUser_FansGroupInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional string remarkName = 65;
        case 65: {
          message.remarkName = readString(bb, readVarint32(bb));
          break;
        }
        // optional int32 mysteryMan = 66;
        case 66: {
          message.mysteryMan = readVarint32(bb);
          break;
        }
        // optional string webRid = 67;
        case 67: {
          message.webRid = readString(bb, readVarint32(bb));
          break;
        }
        // optional string desensitizedNickname = 68;
        case 68: {
          message.desensitizedNickname = readString(bb, readVarint32(bb));
          break;
        }
        // optional User_JAccreditInfo jAccreditInfo = 69;
        case 69: {
          let limit = pushTemporaryLength(bb);
          message.jAccreditInfo = _decodeUser_JAccreditInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional User_Subscribe subscribe = 70;
        case 70: {
          let limit = pushTemporaryLength(bb);
          message.subscribe = _decodeUser_Subscribe(bb);
          bb.limit = limit;
          break;
        }
        // optional bool isAnonymous = 71;
        case 71: {
          message.isAnonymous = !!readByte(bb);
          break;
        }
        // optional int32 consumeDiamondLevel = 72;
        case 72: {
          message.consumeDiamondLevel = readVarint32(bb);
          break;
        }
        // optional string webcastUid = 73;
        case 73: {
          message.webcastUid = readString(bb, readVarint32(bb));
          break;
        }
        // optional User_ProfileStyleParams profileStyleParams = 74;
        case 74: {
          let limit = pushTemporaryLength(bb);
          message.profileStyleParams = _decodeUser_ProfileStyleParams(bb);
          bb.limit = limit;
          break;
        }
        // optional User_UserDressInfo userDressInfo = 75;
        case 75: {
          let limit = pushTemporaryLength(bb);
          message.userDressInfo = _decodeUser_UserDressInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional User_BizRelation bizRelation = 76;
        case 76: {
          let limit = pushTemporaryLength(bb);
          message.bizRelation = _decodeUser_BizRelation(bb);
          bb.limit = limit;
          break;
        }
        // optional MemberEntranceInfo memberEntranceInfo = 77;
        case 77: {
          let limit = pushTemporaryLength(bb);
          message.memberEntranceInfo = _decodeMemberEntranceInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional User_PublicAreaBadgeInfo publicAreaBadgeInfo = 78;
        case 78: {
          let limit = pushTemporaryLength(bb);
          message.publicAreaBadgeInfo = _decodeUser_PublicAreaBadgeInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional User_ExtraInfo extraInfo = 79;
        case 79: {
          let limit = pushTemporaryLength(bb);
          message.extraInfo = _decodeUser_ExtraInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional User_UserSettingInfo userSettingInfo = 80;
        case 80: {
          let limit = pushTemporaryLength(bb);
          message.userSettingInfo = _decodeUser_UserSettingInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 publicAreaOperFreq = 81;
        case 81: {
          message.publicAreaOperFreq = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional User_UserPermissionGrant userPermissionGrantInfo = 82;
        case 82: {
          let limit = pushTemporaryLength(bb);
          message.userPermissionGrantInfo = _decodeUser_UserPermissionGrant(bb);
          bb.limit = limit;
          break;
        }
        // optional bool userCanceled = 83;
        case 83: {
          message.userCanceled = !!readByte(bb);
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_UserAttr(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional bool isMuted = 1;
        case 1: {
          message.isMuted = !!readByte(bb);
          break;
        }
        // optional bool isAdmin = 2;
        case 2: {
          message.isAdmin = !!readByte(bb);
          break;
        }
        // optional bool isSuperAdmin = 3;
        case 3: {
          message.isSuperAdmin = !!readByte(bb);
          break;
        }
        // repeated int32 adminPrivileges = 4;
        case 4: {
          let values = message.adminPrivileges || (message.adminPrivileges = []);
          if ((tag & 7) === 2) {
            let outerLimit = pushTemporaryLength(bb);
            while (!isAtEnd(bb)) {
              values.push(readVarint32(bb));
            }
            bb.limit = outerLimit;
          } else {
            values.push(readVarint32(bb));
          }
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_OwnRoom(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // repeated int64 roomIds = 1;
        case 1: {
          let values = message.roomIds || (message.roomIds = []);
          if ((tag & 7) === 2) {
            let outerLimit = pushTemporaryLength(bb);
            while (!isAtEnd(bb)) {
              values.push(readVarint64(
                bb,
                /* unsigned */
                false
              ));
            }
            bb.limit = outerLimit;
          } else {
            values.push(readVarint64(
              bb,
              /* unsigned */
              false
            ));
          }
          break;
        }
        // repeated string roomIdsStr = 2;
        case 2: {
          let values = message.roomIdsStr || (message.roomIdsStr = []);
          values.push(readString(bb, readVarint32(bb)));
          break;
        }
        // repeated int32 roomIdsDisplay = 3;
        case 3: {
          let values = message.roomIdsDisplay || (message.roomIdsDisplay = []);
          if ((tag & 7) === 2) {
            let outerLimit = pushTemporaryLength(bb);
            while (!isAtEnd(bb)) {
              values.push(readVarint32(bb));
            }
            bb.limit = outerLimit;
          } else {
            values.push(readVarint32(bb));
          }
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_AnchorInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional int64 level = 1;
        case 1: {
          message.level = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_FollowInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional int64 followingCount = 1;
        case 1: {
          message.followingCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 followerCount = 2;
        case 2: {
          message.followerCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 followStatus = 3;
        case 3: {
          message.followStatus = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 pushStatus = 4;
        case 4: {
          message.pushStatus = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string remarkName = 5;
        case 5: {
          message.remarkName = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_FansClub(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional User_FansClub_FansClubData data = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.data = _decodeUser_FansClub_FansClubData(bb);
          bb.limit = limit;
          break;
        }
        // optional map<int32, User_FansClub_FansClubData> preferData = 2;
        case 2: {
          let values = message.preferData || (message.preferData = {});
          let outerLimit = pushTemporaryLength(bb);
          let key;
          let value;
          end_of_entry: while (!isAtEnd(bb)) {
            let tag2 = readVarint32(bb);
            switch (tag2 >>> 3) {
              case 0:
                break end_of_entry;
              case 1: {
                key = readVarint32(bb);
                break;
              }
              case 2: {
                let valueLimit = pushTemporaryLength(bb);
                value = _decodeUser_FansClub_FansClubData(bb);
                bb.limit = valueLimit;
                break;
              }
              default:
                skipUnknownField(bb, tag2 & 7);
            }
          }
          if (key === void 0 || value === void 0) throw new Error("Invalid data for map: preferData");
          values[key] = value;
          bb.limit = outerLimit;
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_FansClub_FansClubData(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional string clubName = 1;
        case 1: {
          message.clubName = readString(bb, readVarint32(bb));
          break;
        }
        // optional int32 level = 2;
        case 2: {
          message.level = readVarint32(bb);
          break;
        }
        // optional int32 userFansClubStatus = 3;
        case 3: {
          message.userFansClubStatus = readVarint32(bb);
          break;
        }
        // optional User_FansClub_FansClubData_UserBadge badge = 4;
        case 4: {
          let limit = pushTemporaryLength(bb);
          message.badge = _decodeUser_FansClub_FansClubData_UserBadge(bb);
          bb.limit = limit;
          break;
        }
        // repeated int64 availableGiftIds = 5;
        case 5: {
          let values = message.availableGiftIds || (message.availableGiftIds = []);
          if ((tag & 7) === 2) {
            let outerLimit = pushTemporaryLength(bb);
            while (!isAtEnd(bb)) {
              values.push(readVarint64(
                bb,
                /* unsigned */
                false
              ));
            }
            bb.limit = outerLimit;
          } else {
            values.push(readVarint64(
              bb,
              /* unsigned */
              false
            ));
          }
          break;
        }
        // optional int64 anchorId = 6;
        case 6: {
          message.anchorId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_FansClub_FansClubData_UserBadge(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional map<int32, Image> icons = 1;
        case 1: {
          let values = message.icons || (message.icons = {});
          let outerLimit = pushTemporaryLength(bb);
          let key;
          let value;
          end_of_entry: while (!isAtEnd(bb)) {
            let tag2 = readVarint32(bb);
            switch (tag2 >>> 3) {
              case 0:
                break end_of_entry;
              case 1: {
                key = readVarint32(bb);
                break;
              }
              case 2: {
                let valueLimit = pushTemporaryLength(bb);
                value = _decodeImage(bb);
                bb.limit = valueLimit;
                break;
              }
              default:
                skipUnknownField(bb, tag2 & 7);
            }
          }
          if (key === void 0 || value === void 0) throw new Error("Invalid data for map: icons");
          values[key] = value;
          bb.limit = outerLimit;
          break;
        }
        // optional string title = 2;
        case 2: {
          message.title = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_Border(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Image icon = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.icon = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 level = 2;
        case 2: {
          message.level = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional Image thumbIcon = 3;
        case 3: {
          let limit = pushTemporaryLength(bb);
          message.thumbIcon = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional string dressId = 4;
        case 4: {
          message.dressId = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_GradeBuffInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional int64 buffLevel = 1;
        case 1: {
          message.buffLevel = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int32 status = 2;
        case 2: {
          message.status = readVarint32(bb);
          break;
        }
        // optional int64 endTime = 3;
        case 3: {
          message.endTime = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional map<int64, int64> statsInfo = 4;
        case 4: {
          let values = message.statsInfo || (message.statsInfo = {});
          let outerLimit = pushTemporaryLength(bb);
          let key;
          let value;
          end_of_entry: while (!isAtEnd(bb)) {
            let tag2 = readVarint32(bb);
            switch (tag2 >>> 3) {
              case 0:
                break end_of_entry;
              case 1: {
                key = readVarint64(
                  bb,
                  /* unsigned */
                  false
                );
                break;
              }
              case 2: {
                value = readVarint64(
                  bb,
                  /* unsigned */
                  false
                );
                break;
              }
              default:
                skipUnknownField(bb, tag2 & 7);
            }
          }
          if (key === void 0 || value === void 0) throw new Error("Invalid data for map: statsInfo");
          values[key] = value;
          bb.limit = outerLimit;
          break;
        }
        // optional Image buffBadge = 5;
        case 5: {
          let limit = pushTemporaryLength(bb);
          message.buffBadge = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_PayGrade(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional int64 totalDiamondCount = 1;
        case 1: {
          message.totalDiamondCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional Image diamondIcon = 2;
        case 2: {
          let limit = pushTemporaryLength(bb);
          message.diamondIcon = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional string name = 3;
        case 3: {
          message.name = readString(bb, readVarint32(bb));
          break;
        }
        // optional Image icon = 4;
        case 4: {
          let limit = pushTemporaryLength(bb);
          message.icon = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional string nextName = 5;
        case 5: {
          message.nextName = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 level = 6;
        case 6: {
          message.level = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional Image nextIcon = 7;
        case 7: {
          let limit = pushTemporaryLength(bb);
          message.nextIcon = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 nextDiamond = 8;
        case 8: {
          message.nextDiamond = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 nowDiamond = 9;
        case 9: {
          message.nowDiamond = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 thisGradeMinDiamond = 10;
        case 10: {
          message.thisGradeMinDiamond = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 thisGradeMaxDiamond = 11;
        case 11: {
          message.thisGradeMaxDiamond = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 payDiamondBak = 12;
        case 12: {
          message.payDiamondBak = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string gradeDescribe = 13;
        case 13: {
          message.gradeDescribe = readString(bb, readVarint32(bb));
          break;
        }
        // repeated User_PayGrade_GradeIcon gradeIconList = 14;
        case 14: {
          let limit = pushTemporaryLength(bb);
          let values = message.gradeIconList || (message.gradeIconList = []);
          values.push(_decodeUser_PayGrade_GradeIcon(bb));
          bb.limit = limit;
          break;
        }
        // optional int64 screenChatType = 15;
        case 15: {
          message.screenChatType = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional Image imIcon = 16;
        case 16: {
          let limit = pushTemporaryLength(bb);
          message.imIcon = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image imIconWithLevel = 17;
        case 17: {
          let limit = pushTemporaryLength(bb);
          message.imIconWithLevel = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image liveIcon = 18;
        case 18: {
          let limit = pushTemporaryLength(bb);
          message.liveIcon = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image newImIconWithLevel = 19;
        case 19: {
          let limit = pushTemporaryLength(bb);
          message.newImIconWithLevel = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image newLiveIcon = 20;
        case 20: {
          let limit = pushTemporaryLength(bb);
          message.newLiveIcon = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 upgradeNeedConsume = 21;
        case 21: {
          message.upgradeNeedConsume = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string nextPrivileges = 22;
        case 22: {
          message.nextPrivileges = readString(bb, readVarint32(bb));
          break;
        }
        // optional Image background = 23;
        case 23: {
          let limit = pushTemporaryLength(bb);
          message.background = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image backgroundBack = 24;
        case 24: {
          let limit = pushTemporaryLength(bb);
          message.backgroundBack = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 score = 25;
        case 25: {
          message.score = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional User_GradeBuffInfo buffInfo = 26;
        case 26: {
          let limit = pushTemporaryLength(bb);
          message.buffInfo = _decodeUser_GradeBuffInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional string gradeBanner = 1001;
        case 1001: {
          message.gradeBanner = readString(bb, readVarint32(bb));
          break;
        }
        // optional Image profileDialogBg = 1002;
        case 1002: {
          let limit = pushTemporaryLength(bb);
          message.profileDialogBg = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image profileDialogBgBack = 1003;
        case 1003: {
          let limit = pushTemporaryLength(bb);
          message.profileDialogBgBack = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_PayGrade_GradeIcon(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Image icon = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.icon = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 iconDiamond = 2;
        case 2: {
          message.iconDiamond = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 level = 3;
        case 3: {
          message.level = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string levelStr = 4;
        case 4: {
          message.levelStr = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_AnchorLevel(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional int64 level = 1;
        case 1: {
          message.level = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 experience = 2;
        case 2: {
          message.experience = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 lowestExperienceThisLevel = 3;
        case 3: {
          message.lowestExperienceThisLevel = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 highestExperienceThisLevel = 4;
        case 4: {
          message.highestExperienceThisLevel = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 taskStartExperience = 5;
        case 5: {
          message.taskStartExperience = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 taskStartTime = 6;
        case 6: {
          message.taskStartTime = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 taskDecreaseExperience = 7;
        case 7: {
          message.taskDecreaseExperience = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 taskTargetExperience = 8;
        case 8: {
          message.taskTargetExperience = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 taskEndTime = 9;
        case 9: {
          message.taskEndTime = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional Image profileDialogBg = 10;
        case 10: {
          let limit = pushTemporaryLength(bb);
          message.profileDialogBg = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image profileDialogBgBack = 11;
        case 11: {
          let limit = pushTemporaryLength(bb);
          message.profileDialogBgBack = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image stageLevel = 12;
        case 12: {
          let limit = pushTemporaryLength(bb);
          message.stageLevel = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image smallIcon = 13;
        case 13: {
          let limit = pushTemporaryLength(bb);
          message.smallIcon = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_AuthorStats(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional int64 videoTotalCount = 1;
        case 1: {
          message.videoTotalCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 videoTotalPlayCount = 2;
        case 2: {
          message.videoTotalPlayCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 videoTotalShareCount = 3;
        case 3: {
          message.videoTotalShareCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 videoTotalSeriesCount = 4;
        case 4: {
          message.videoTotalSeriesCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 varietyShowPlayCount = 5;
        case 5: {
          message.varietyShowPlayCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 videoTotalFavoriteCount = 6;
        case 6: {
          message.videoTotalFavoriteCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_XiguaParams(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_ActivityInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_NobleLevelInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Image nobleBackground = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.nobleBackground = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 nobleLevel = 2;
        case 2: {
          message.nobleLevel = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional Image nobleIcon = 3;
        case 3: {
          let limit = pushTemporaryLength(bb);
          message.nobleIcon = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional string nobleName = 4;
        case 4: {
          message.nobleName = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 expireTime = 5;
        case 5: {
          message.expireTime = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional Image nobleBigIcon = 6;
        case 6: {
          let limit = pushTemporaryLength(bb);
          message.nobleBigIcon = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image nobleIconWithBack = 7;
        case 7: {
          let limit = pushTemporaryLength(bb);
          message.nobleIconWithBack = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image nobleBoarder = 8;
        case 8: {
          let limit = pushTemporaryLength(bb);
          message.nobleBoarder = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional string nobleBackgroundColor = 9;
        case 9: {
          message.nobleBackgroundColor = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_BrotherhoodInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_AuthenticationInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_PoiInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_FansGroupInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_JAccreditInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_Subscribe(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_ProfileStyleParams(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_UserDressInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_BizRelation(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_PublicAreaBadgeInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_ExtraInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_UserSettingInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUser_UserPermissionGrant(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeTextFormat(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional string color = 1;
        case 1: {
          message.color = readString(bb, readVarint32(bb));
          break;
        }
        // optional bool bold = 2;
        case 2: {
          message.bold = !!readByte(bb);
          break;
        }
        // optional bool italic = 3;
        case 3: {
          message.italic = !!readByte(bb);
          break;
        }
        // optional int32 weight = 4;
        case 4: {
          message.weight = readVarint32(bb);
          break;
        }
        // optional int32 italicAngle = 5;
        case 5: {
          message.italicAngle = readVarint32(bb);
          break;
        }
        // optional int32 fontSize = 6;
        case 6: {
          message.fontSize = readVarint32(bb);
          break;
        }
        // optional bool userHeightLightColor = 7;
        case 7: {
          message.userHeightLightColor = !!readByte(bb);
          break;
        }
        // optional bool useRemoteClor = 8;
        case 8: {
          message.useRemoteClor = !!readByte(bb);
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeTextPiece(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional int32 type = 1;
        case 1: {
          message.type = readVarint32(bb);
          break;
        }
        // optional TextFormat format = 2;
        case 2: {
          let limit = pushTemporaryLength(bb);
          message.format = _decodeTextFormat(bb);
          bb.limit = limit;
          break;
        }
        // optional string valueRef = 3;
        case 3: {
          message.valueRef = readString(bb, readVarint32(bb));
          break;
        }
        // optional string stringValue = 11;
        case 11: {
          message.stringValue = readString(bb, readVarint32(bb));
          break;
        }
        // optional TextPieceUser userValue = 21;
        case 21: {
          let limit = pushTemporaryLength(bb);
          message.userValue = _decodeTextPieceUser(bb);
          bb.limit = limit;
          break;
        }
        // optional TextPieceGift giftValue = 22;
        case 22: {
          let limit = pushTemporaryLength(bb);
          message.giftValue = _decodeTextPieceGift(bb);
          bb.limit = limit;
          break;
        }
        // optional TextPieceHeart heartValue = 23;
        case 23: {
          let limit = pushTemporaryLength(bb);
          message.heartValue = _decodeTextPieceHeart(bb);
          bb.limit = limit;
          break;
        }
        // optional TextPiecePatternRef patternRefValue = 24;
        case 24: {
          let limit = pushTemporaryLength(bb);
          message.patternRefValue = _decodeTextPiecePatternRef(bb);
          bb.limit = limit;
          break;
        }
        // optional TextPieceImage imageValue = 25;
        case 25: {
          let limit = pushTemporaryLength(bb);
          message.imageValue = _decodeTextPieceImage(bb);
          bb.limit = limit;
          break;
        }
        // optional string schemaKey = 100;
        case 100: {
          message.schemaKey = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeTextPieceGift(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional int64 giftId = 1;
        case 1: {
          message.giftId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional PatternRef nameRef = 2;
        case 2: {
          let limit = pushTemporaryLength(bb);
          message.nameRef = _decodePatternRef(bb);
          bb.limit = limit;
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeTextPieceHeart(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional string color = 1;
        case 1: {
          message.color = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeTextPiecePatternRef(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional string key = 1;
        case 1: {
          message.key = readString(bb, readVarint32(bb));
          break;
        }
        // optional string defaultPattern = 2;
        case 2: {
          message.defaultPattern = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeTextPieceImage(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Image image = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.image = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional float scalingRate = 2;
        case 2: {
          message.scalingRate = readFloat(bb);
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodePatternRef(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional string key = 1;
        case 1: {
          message.key = readString(bb, readVarint32(bb));
          break;
        }
        // optional string defaultPattern = 2;
        case 2: {
          message.defaultPattern = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeImage(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // repeated string urlList = 1;
        case 1: {
          let values = message.urlList || (message.urlList = []);
          values.push(readString(bb, readVarint32(bb)));
          break;
        }
        // optional string uri = 2;
        case 2: {
          message.uri = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 height = 3;
        case 3: {
          message.height = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 width = 4;
        case 4: {
          message.width = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string avgColor = 5;
        case 5: {
          message.avgColor = readString(bb, readVarint32(bb));
          break;
        }
        // optional int32 imageType = 6;
        case 6: {
          message.imageType = readVarint32(bb);
          break;
        }
        // optional string openWebUrl = 7;
        case 7: {
          message.openWebUrl = readString(bb, readVarint32(bb));
          break;
        }
        // optional Image_Content content = 8;
        case 8: {
          let limit = pushTemporaryLength(bb);
          message.content = _decodeImage_Content(bb);
          bb.limit = limit;
          break;
        }
        // optional bool isAnimated = 9;
        case 9: {
          message.isAnimated = !!readByte(bb);
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeImage_Content(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional string name = 1;
        case 1: {
          message.name = readString(bb, readVarint32(bb));
          break;
        }
        // optional string fontColor = 2;
        case 2: {
          message.fontColor = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 level = 3;
        case 3: {
          message.level = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string alternativeText = 4;
        case 4: {
          message.alternativeText = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeUserVIPInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeIndustryCertification(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeMemberEntranceInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeTextPieceUser(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional User user = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.user = _decodeUser(bb);
          bb.limit = limit;
          break;
        }
        // optional bool withColon = 2;
        case 2: {
          message.withColon = !!readByte(bb);
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodePublicAreaCommon(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Image userLabel = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.userLabel = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 userConsumeInRoom = 2;
        case 2: {
          message.userConsumeInRoom = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 userSendGiftCntInRoom = 3;
        case 3: {
          message.userSendGiftCntInRoom = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 individualPriority = 4;
        case 4: {
          message.individualPriority = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 supportPin = 6;
        case 6: {
          message.supportPin = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional SuffixText suffixText = 7;
        case 7: {
          let limit = pushTemporaryLength(bb);
          message.suffixText = _decodeSuffixText(bb);
          bb.limit = limit;
          break;
        }
        // optional int32 imAction = 8;
        case 8: {
          message.imAction = readVarint32(bb);
          break;
        }
        // optional int32 forbiddenProfile = 9;
        case 9: {
          message.forbiddenProfile = readVarint32(bb);
          break;
        }
        // optional ChatReplyRespInfo replyResp = 10;
        case 10: {
          let limit = pushTemporaryLength(bb);
          message.replyResp = _decodeChatReplyRespInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 isFeatured = 12;
        case 12: {
          message.isFeatured = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional bool needFilterDisplay = 13;
        case 13: {
          message.needFilterDisplay = !!readByte(bb);
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeAnchorGiftData(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Image anchorDiyOriginImg = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.anchorDiyOriginImg = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeAssetEffectMixInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeBuffLockInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional bool locked = 1;
        case 1: {
          message.locked = !!readByte(bb);
          break;
        }
        // optional string toast = 2;
        case 2: {
          message.toast = readString(bb, readVarint32(bb));
          break;
        }
        // optional string schema = 3;
        case 3: {
          message.schema = readString(bb, readVarint32(bb));
          break;
        }
        // optional string cellText = 4;
        case 4: {
          message.cellText = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeChatReplyRespInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional int64 replyMsgId = 1;
        case 1: {
          message.replyMsgId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 replyId = 2;
        case 2: {
          message.replyId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional Text replyText = 3;
        case 3: {
          let limit = pushTemporaryLength(bb);
          message.replyText = _decodeText(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 replyUid = 4;
        case 4: {
          message.replyUid = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string replyWebcastUid = 5;
        case 5: {
          message.replyWebcastUid = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeExtraEffect(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional int64 assetId = 1;
        case 1: {
          message.assetId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int32 displayForm = 2;
        case 2: {
          message.displayForm = readVarint32(bb);
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeEmojiInteractResource(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional SendInteractEmojiConfig fromImage = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.fromImage = _decodeSendInteractEmojiConfig(bb);
          bb.limit = limit;
          break;
        }
        // optional SendInteractEmojiConfig passImage = 2;
        case 2: {
          let limit = pushTemporaryLength(bb);
          message.passImage = _decodeSendInteractEmojiConfig(bb);
          bb.limit = limit;
          break;
        }
        // optional SendInteractEmojiConfig toImage = 3;
        case 3: {
          let limit = pushTemporaryLength(bb);
          message.toImage = _decodeSendInteractEmojiConfig(bb);
          bb.limit = limit;
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeGiftIMPriority(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // repeated int64 queueSizes = 1;
        case 1: {
          let values = message.queueSizes || (message.queueSizes = []);
          if ((tag & 7) === 2) {
            let outerLimit = pushTemporaryLength(bb);
            while (!isAtEnd(bb)) {
              values.push(readVarint64(
                bb,
                /* unsigned */
                false
              ));
            }
            bb.limit = outerLimit;
          } else {
            values.push(readVarint64(
              bb,
              /* unsigned */
              false
            ));
          }
          break;
        }
        // optional int64 selfQueuePriority = 2;
        case 2: {
          message.selfQueuePriority = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 priority = 3;
        case 3: {
          message.priority = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeGiftTrayInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Text trayDisplayText = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.trayDisplayText = _decodeText(bb);
          bb.limit = limit;
          break;
        }
        // optional Image trayBaseImg = 2;
        case 2: {
          let limit = pushTemporaryLength(bb);
          message.trayBaseImg = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image trayHeadImg = 3;
        case 3: {
          let limit = pushTemporaryLength(bb);
          message.trayHeadImg = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image trayRightImg = 4;
        case 4: {
          let limit = pushTemporaryLength(bb);
          message.trayRightImg = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 trayLevel = 5;
        case 5: {
          message.trayLevel = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional Image trayDynamicImg = 6;
        case 6: {
          let limit = pushTemporaryLength(bb);
          message.trayDynamicImg = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeGiftStruct(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Image image = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.image = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional string describe = 2;
        case 2: {
          message.describe = readString(bb, readVarint32(bb));
          break;
        }
        // optional bool notify = 3;
        case 3: {
          message.notify = !!readByte(bb);
          break;
        }
        // optional int64 duration = 4;
        case 4: {
          message.duration = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 id = 5;
        case 5: {
          message.id = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional GiftStruct_GiftStructFansClubInfo fansclubInfo = 6;
        case 6: {
          let limit = pushTemporaryLength(bb);
          message.fansclubInfo = _decodeGiftStruct_GiftStructFansClubInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional bool forLinkmic = 7;
        case 7: {
          message.forLinkmic = !!readByte(bb);
          break;
        }
        // optional bool doodle = 8;
        case 8: {
          message.doodle = !!readByte(bb);
          break;
        }
        // optional bool forFansclub = 9;
        case 9: {
          message.forFansclub = !!readByte(bb);
          break;
        }
        // optional bool combo = 10;
        case 10: {
          message.combo = !!readByte(bb);
          break;
        }
        // optional int32 type = 11;
        case 11: {
          message.type = readVarint32(bb);
          break;
        }
        // optional int32 diamondCount = 12;
        case 12: {
          message.diamondCount = readVarint32(bb);
          break;
        }
        // optional int32 isDisplayedOnPanel = 13;
        case 13: {
          message.isDisplayedOnPanel = readVarint32(bb);
          break;
        }
        // optional int64 primaryEffectId = 14;
        case 14: {
          message.primaryEffectId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional Image giftLabelIcon = 15;
        case 15: {
          let limit = pushTemporaryLength(bb);
          message.giftLabelIcon = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional string name = 16;
        case 16: {
          message.name = readString(bb, readVarint32(bb));
          break;
        }
        // optional string region = 17;
        case 17: {
          message.region = readString(bb, readVarint32(bb));
          break;
        }
        // optional string manual = 18;
        case 18: {
          message.manual = readString(bb, readVarint32(bb));
          break;
        }
        // optional bool forCustom = 19;
        case 19: {
          message.forCustom = !!readByte(bb);
          break;
        }
        // optional map<string, int64> specialEffects = 20;
        case 20: {
          let values = message.specialEffects || (message.specialEffects = {});
          let outerLimit = pushTemporaryLength(bb);
          let key;
          let value;
          end_of_entry: while (!isAtEnd(bb)) {
            let tag2 = readVarint32(bb);
            switch (tag2 >>> 3) {
              case 0:
                break end_of_entry;
              case 1: {
                key = readString(bb, readVarint32(bb));
                break;
              }
              case 2: {
                value = readVarint64(
                  bb,
                  /* unsigned */
                  false
                );
                break;
              }
              default:
                skipUnknownField(bb, tag2 & 7);
            }
          }
          if (key === void 0 || value === void 0) throw new Error("Invalid data for map: specialEffects");
          values[key] = value;
          bb.limit = outerLimit;
          break;
        }
        // optional Image icon = 21;
        case 21: {
          let limit = pushTemporaryLength(bb);
          message.icon = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional int32 actionType = 22;
        case 22: {
          message.actionType = readVarint32(bb);
          break;
        }
        // optional int32 watermelonSeeds = 23;
        case 23: {
          message.watermelonSeeds = readVarint32(bb);
          break;
        }
        // optional string goldEffect = 24;
        case 24: {
          message.goldEffect = readString(bb, readVarint32(bb));
          break;
        }
        // repeated LuckyMoneyGiftMeta subs = 25;
        case 25: {
          let limit = pushTemporaryLength(bb);
          let values = message.subs || (message.subs = []);
          values.push(_decodeLuckyMoneyGiftMeta(bb));
          bb.limit = limit;
          break;
        }
        // optional int64 goldenBeans = 26;
        case 26: {
          message.goldenBeans = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 honorLevel = 27;
        case 27: {
          message.honorLevel = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int32 itemType = 28;
        case 28: {
          message.itemType = readVarint32(bb);
          break;
        }
        // optional string schemeUrl = 29;
        case 29: {
          message.schemeUrl = readString(bb, readVarint32(bb));
          break;
        }
        // optional GiftPanelOperation giftOperation = 30;
        case 30: {
          let limit = pushTemporaryLength(bb);
          message.giftOperation = _decodeGiftPanelOperation(bb);
          bb.limit = limit;
          break;
        }
        // optional string eventName = 31;
        case 31: {
          message.eventName = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 nobleLevel = 32;
        case 32: {
          message.nobleLevel = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string guideUrl = 33;
        case 33: {
          message.guideUrl = readString(bb, readVarint32(bb));
          break;
        }
        // optional bool punishMedicine = 34;
        case 34: {
          message.punishMedicine = !!readByte(bb);
          break;
        }
        // optional bool forPortal = 35;
        case 35: {
          message.forPortal = !!readByte(bb);
          break;
        }
        // optional string businessText = 36;
        case 36: {
          message.businessText = readString(bb, readVarint32(bb));
          break;
        }
        // optional bool cnyGift = 37;
        case 37: {
          message.cnyGift = !!readByte(bb);
          break;
        }
        // optional int64 appId = 38;
        case 38: {
          message.appId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 vipLevel = 39;
        case 39: {
          message.vipLevel = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional bool isGray = 40;
        case 40: {
          message.isGray = !!readByte(bb);
          break;
        }
        // optional string graySchemeUrl = 41;
        case 41: {
          message.graySchemeUrl = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 giftScene = 42;
        case 42: {
          message.giftScene = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional GiftBanner giftBanner = 43;
        case 43: {
          let limit = pushTemporaryLength(bb);
          message.giftBanner = _decodeGiftBanner(bb);
          bb.limit = limit;
          break;
        }
        // repeated string triggerWords = 44;
        case 44: {
          let values = message.triggerWords || (message.triggerWords = []);
          values.push(readString(bb, readVarint32(bb)));
          break;
        }
        // repeated GiftBuffInfo giftBuffInfos = 45;
        case 45: {
          let limit = pushTemporaryLength(bb);
          let values = message.giftBuffInfos || (message.giftBuffInfos = []);
          values.push(_decodeGiftBuffInfo(bb));
          bb.limit = limit;
          break;
        }
        // optional bool forFirstRecharge = 46;
        case 46: {
          message.forFirstRecharge = !!readByte(bb);
          break;
        }
        // optional Image dynamicImgForSelected = 47;
        case 47: {
          let limit = pushTemporaryLength(bb);
          message.dynamicImgForSelected = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional int32 afterSendAction = 48;
        case 48: {
          message.afterSendAction = readVarint32(bb);
          break;
        }
        // optional int64 giftOfflineTime = 49;
        case 49: {
          message.giftOfflineTime = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string topBarText = 50;
        case 50: {
          message.topBarText = readString(bb, readVarint32(bb));
          break;
        }
        // optional Image topRightAvatar = 51;
        case 51: {
          let limit = pushTemporaryLength(bb);
          message.topRightAvatar = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional string bannerSchemeUrl = 52;
        case 52: {
          message.bannerSchemeUrl = readString(bb, readVarint32(bb));
          break;
        }
        // optional bool isLocked = 53;
        case 53: {
          message.isLocked = !!readByte(bb);
          break;
        }
        // optional int64 reqExtraType = 54;
        case 54: {
          message.reqExtraType = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // repeated int64 assetIds = 55;
        case 55: {
          let values = message.assetIds || (message.assetIds = []);
          if ((tag & 7) === 2) {
            let outerLimit = pushTemporaryLength(bb);
            while (!isAtEnd(bb)) {
              values.push(readVarint64(
                bb,
                /* unsigned */
                false
              ));
            }
            bb.limit = outerLimit;
          } else {
            values.push(readVarint64(
              bb,
              /* unsigned */
              false
            ));
          }
          break;
        }
        // optional GiftPreviewInfo giftPreviewInfo = 56;
        case 56: {
          let limit = pushTemporaryLength(bb);
          message.giftPreviewInfo = _decodeGiftPreviewInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional GiftTip giftTip = 57;
        case 57: {
          let limit = pushTemporaryLength(bb);
          message.giftTip = _decodeGiftTip(bb);
          bb.limit = limit;
          break;
        }
        // optional int32 needSweepLightCount = 58;
        case 58: {
          message.needSweepLightCount = readVarint32(bb);
          break;
        }
        // repeated GiftGroupInfo groupInfo = 59;
        case 59: {
          let limit = pushTemporaryLength(bb);
          let values = message.groupInfo || (message.groupInfo = []);
          values.push(_decodeGiftGroupInfo(bb));
          bb.limit = limit;
          break;
        }
        // optional Text bottomText = 60;
        case 60: {
          let limit = pushTemporaryLength(bb);
          message.bottomText = _decodeText(bb);
          bb.limit = limit;
          break;
        }
        // optional int32 mysteryShopStatus = 61;
        case 61: {
          message.mysteryShopStatus = readVarint32(bb);
          break;
        }
        // repeated int64 optionalAssetIds = 62;
        case 62: {
          let values = message.optionalAssetIds || (message.optionalAssetIds = []);
          if ((tag & 7) === 2) {
            let outerLimit = pushTemporaryLength(bb);
            while (!isAtEnd(bb)) {
              values.push(readVarint64(
                bb,
                /* unsigned */
                false
              ));
            }
            bb.limit = outerLimit;
          } else {
            values.push(readVarint64(
              bb,
              /* unsigned */
              false
            ));
          }
          break;
        }
        // optional bool disableWishList = 63;
        case 63: {
          message.disableWishList = !!readByte(bb);
          break;
        }
        // optional GiftStruct_GiftMsgBoard giftMsgBoard = 64;
        case 64: {
          let limit = pushTemporaryLength(bb);
          message.giftMsgBoard = _decodeGiftStruct_GiftMsgBoard(bb);
          bb.limit = limit;
          break;
        }
        // optional EmojiInteractResource emojiInteractResource = 65;
        case 65: {
          let limit = pushTemporaryLength(bb);
          message.emojiInteractResource = _decodeEmojiInteractResource(bb);
          bb.limit = limit;
          break;
        }
        // optional bool trayDynamicImgFlippable = 66;
        case 66: {
          message.trayDynamicImgFlippable = !!readByte(bb);
          break;
        }
        // optional int64 picoShowAction = 67;
        case 67: {
          message.picoShowAction = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 selectedDynamicEffect = 68;
        case 68: {
          message.selectedDynamicEffect = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional GiftTouchLabel giftTouchLabel = 69;
        case 69: {
          let limit = pushTemporaryLength(bb);
          message.giftTouchLabel = _decodeGiftTouchLabel(bb);
          bb.limit = limit;
          break;
        }
        // optional GiftUnselectedBottomInfo unselectedBottomInfo = 70;
        case 70: {
          let limit = pushTemporaryLength(bb);
          message.unselectedBottomInfo = _decodeGiftUnselectedBottomInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional GiftConfirmInfo giftConfirmInfo = 71;
        case 71: {
          let limit = pushTemporaryLength(bb);
          message.giftConfirmInfo = _decodeGiftConfirmInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional int32 bizType = 72;
        case 72: {
          message.bizType = readVarint32(bb);
          break;
        }
        // optional GoodsBizItem bizItem = 73;
        case 73: {
          let limit = pushTemporaryLength(bb);
          message.bizItem = _decodeGoodsBizItem(bb);
          bb.limit = limit;
          break;
        }
        // optional Image webpImage = 74;
        case 74: {
          let limit = pushTemporaryLength(bb);
          message.webpImage = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional int32 giftSource = 75;
        case 75: {
          message.giftSource = readVarint32(bb);
          break;
        }
        // repeated int64 requiredAssets = 76;
        case 76: {
          let values = message.requiredAssets || (message.requiredAssets = []);
          if ((tag & 7) === 2) {
            let outerLimit = pushTemporaryLength(bb);
            while (!isAtEnd(bb)) {
              values.push(readVarint64(
                bb,
                /* unsigned */
                false
              ));
            }
            bb.limit = outerLimit;
          } else {
            values.push(readVarint64(
              bb,
              /* unsigned */
              false
            ));
          }
          break;
        }
        // optional Image selectedLabel = 77;
        case 77: {
          let limit = pushTemporaryLength(bb);
          message.selectedLabel = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 sortScore = 78;
        case 78: {
          message.sortScore = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 topicId = 79;
        case 79: {
          message.topicId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string sortExtra = 80;
        case 80: {
          message.sortExtra = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeGiftStruct_GiftStructFansClubInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional int32 minLevel = 1;
        case 1: {
          message.minLevel = readVarint32(bb);
          break;
        }
        // optional int32 insertPos = 2;
        case 2: {
          message.insertPos = readVarint32(bb);
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeGiftStruct_GiftMsgBoard(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional bool forMsgBoard = 1;
        case 1: {
          message.forMsgBoard = !!readByte(bb);
          break;
        }
        // optional string promptText = 2;
        case 2: {
          message.promptText = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeGiftTouchLabel(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Image icon = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.icon = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional string uniqueKey = 2;
        case 2: {
          message.uniqueKey = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeGiftUnselectedBottomInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional string text = 1;
        case 1: {
          message.text = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeGiftConfirmInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional string title = 1;
        case 1: {
          message.title = readString(bb, readVarint32(bb));
          break;
        }
        // optional string text = 2;
        case 2: {
          message.text = readString(bb, readVarint32(bb));
          break;
        }
        // optional string cancelButtonText = 3;
        case 3: {
          message.cancelButtonText = readString(bb, readVarint32(bb));
          break;
        }
        // optional string confirmButtonText = 4;
        case 4: {
          message.confirmButtonText = readString(bb, readVarint32(bb));
          break;
        }
        // optional int32 confirmType = 5;
        case 5: {
          message.confirmType = readVarint32(bb);
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeGiftPreviewInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional int64 lockStatus = 1;
        case 1: {
          message.lockStatus = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional bool clientBlockUseSchemeUrl = 2;
        case 2: {
          message.clientBlockUseSchemeUrl = !!readByte(bb);
          break;
        }
        // optional string blockSchemeUrl = 3;
        case 3: {
          message.blockSchemeUrl = readString(bb, readVarint32(bb));
          break;
        }
        // optional bool clientCheckLeftDiamond = 4;
        case 4: {
          message.clientCheckLeftDiamond = !!readByte(bb);
          break;
        }
        // optional string blockToast = 5;
        case 5: {
          message.blockToast = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeGiftTip(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Text displayText = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.displayText = _decodeText(bb);
          bb.limit = limit;
          break;
        }
        // optional string backgroundColor = 2;
        case 2: {
          message.backgroundColor = readString(bb, readVarint32(bb));
          break;
        }
        // optional Image prefixImage = 3;
        case 3: {
          let limit = pushTemporaryLength(bb);
          message.prefixImage = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 remainingDuration = 4;
        case 4: {
          message.remainingDuration = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional Text remainingDurationSuffixText = 5;
        case 5: {
          let limit = pushTemporaryLength(bb);
          message.remainingDurationSuffixText = _decodeText(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 countdownDeadlineTime = 6;
        case 6: {
          message.countdownDeadlineTime = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeGiftGroupInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional int32 groupCount = 1;
        case 1: {
          message.groupCount = readVarint32(bb);
          break;
        }
        // optional string groupText = 2;
        case 2: {
          message.groupText = readString(bb, readVarint32(bb));
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeGiftPanelOperation(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeGiftBanner(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Text displayText = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.displayText = _decodeText(bb);
          bb.limit = limit;
          break;
        }
        // optional string displayTextBgColor = 2;
        case 2: {
          message.displayTextBgColor = readString(bb, readVarint32(bb));
          break;
        }
        // optional Image boxImg = 3;
        case 3: {
          let limit = pushTemporaryLength(bb);
          message.boxImg = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image bgImg = 4;
        case 4: {
          let limit = pushTemporaryLength(bb);
          message.bgImg = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional string schemeUrl = 5;
        case 5: {
          message.schemeUrl = readString(bb, readVarint32(bb));
          break;
        }
        // optional bool animate = 6;
        case 6: {
          message.animate = !!readByte(bb);
          break;
        }
        // optional int64 boxId = 7;
        case 7: {
          message.boxId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 availableBoxCount = 8;
        case 8: {
          message.availableBoxCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeGiftBuffInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional string text = 1;
        case 1: {
          message.text = readString(bb, readVarint32(bb));
          break;
        }
        // optional string textColor = 2;
        case 2: {
          message.textColor = readString(bb, readVarint32(bb));
          break;
        }
        // optional Image bgImg = 3;
        case 3: {
          let limit = pushTemporaryLength(bb);
          message.bgImg = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image sweepLightImg = 4;
        case 4: {
          let limit = pushTemporaryLength(bb);
          message.sweepLightImg = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image buffGiftDescribeImg = 5;
        case 5: {
          let limit = pushTemporaryLength(bb);
          message.buffGiftDescribeImg = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 buffGiftId = 6;
        case 6: {
          message.buffGiftId = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int32 buffLevel = 7;
        case 7: {
          message.buffLevel = readVarint32(bb);
          break;
        }
        // optional bool buffCanSend = 8;
        case 8: {
          message.buffCanSend = !!readByte(bb);
          break;
        }
        // optional int64 buffDiamondCount = 9;
        case 9: {
          message.buffDiamondCount = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional string lockToast = 10;
        case 10: {
          message.lockToast = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 defaultChoseAction = 11;
        case 11: {
          message.defaultChoseAction = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 startTime = 12;
        case 12: {
          message.startTime = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional BuffLockInfo buffLockInfo = 13;
        case 13: {
          let limit = pushTemporaryLength(bb);
          message.buffLockInfo = _decodeBuffLockInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional Image bgImgV2 = 14;
        case 14: {
          let limit = pushTemporaryLength(bb);
          message.bgImgV2 = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeGoodsBizItem(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeLuckyMoneyGiftMeta(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Image image = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.image = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional string describe = 2;
        case 2: {
          message.describe = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 id = 3;
        case 3: {
          message.id = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int32 diamondCount = 4;
        case 4: {
          message.diamondCount = readVarint32(bb);
          break;
        }
        // optional Image icon = 5;
        case 5: {
          let limit = pushTemporaryLength(bb);
          message.icon = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeSendTogether(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional string id = 1;
        case 1: {
          message.id = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 startTime = 2;
        case 2: {
          message.startTime = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 endTime = 3;
        case 3: {
          message.endTime = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeSeriesPlayGift(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional GiftStruct giftStruct = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.giftStruct = _decodeGiftStruct(bb);
          bb.limit = limit;
          break;
        }
        // optional SeriesTrayInfo seriesTrayInfo = 2;
        case 2: {
          let limit = pushTemporaryLength(bb);
          message.seriesTrayInfo = _decodeSeriesTrayInfo(bb);
          bb.limit = limit;
          break;
        }
        // optional SendTogether sendTogether = 3;
        case 3: {
          let limit = pushTemporaryLength(bb);
          message.sendTogether = _decodeSendTogether(bb);
          bb.limit = limit;
          break;
        }
        // optional string diyItemInfo = 4;
        case 4: {
          message.diyItemInfo = readString(bb, readVarint32(bb));
          break;
        }
        // optional AnchorGiftData anchorGift = 5;
        case 5: {
          let limit = pushTemporaryLength(bb);
          message.anchorGift = _decodeAnchorGiftData(bb);
          bb.limit = limit;
          break;
        }
        // optional AssetEffectMixInfo assetEffectMixInfo = 6;
        case 6: {
          let limit = pushTemporaryLength(bb);
          message.assetEffectMixInfo = _decodeAssetEffectMixInfo(bb);
          bb.limit = limit;
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeSeriesTrayInfo(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional int64 duration = 1;
        case 1: {
          message.duration = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional Image staticImg = 2;
        case 2: {
          let limit = pushTemporaryLength(bb);
          message.staticImg = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional Image dynamicImg = 3;
        case 3: {
          let limit = pushTemporaryLength(bb);
          message.dynamicImg = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeSuffixText(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional int64 bizType = 1;
        case 1: {
          message.bizType = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional Text text = 2;
        case 2: {
          let limit = pushTemporaryLength(bb);
          message.text = _decodeText(bb);
          bb.limit = limit;
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function _decodeSendInteractEmojiConfig(bb) {
    let message = {};
    end_of_message: while (!isAtEnd(bb)) {
      let tag = readVarint32(bb);
      switch (tag >>> 3) {
        case 0:
          break end_of_message;
        // optional Image interactEmoji = 1;
        case 1: {
          let limit = pushTemporaryLength(bb);
          message.interactEmoji = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 durationMs = 2;
        case 2: {
          message.durationMs = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 start = 3;
        case 3: {
          message.start = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional Image ownEmoji = 4;
        case 4: {
          let limit = pushTemporaryLength(bb);
          message.ownEmoji = _decodeImage(bb);
          bb.limit = limit;
          break;
        }
        // optional int64 ownEmojiDurationMs = 5;
        case 5: {
          message.ownEmojiDurationMs = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 offset = 6;
        case 6: {
          message.offset = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional int64 scaleUp = 7;
        case 7: {
          message.scaleUp = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        // optional bool reshape = 8;
        case 8: {
          message.reshape = !!readByte(bb);
          break;
        }
        // optional string soundUrl = 9;
        case 9: {
          message.soundUrl = readString(bb, readVarint32(bb));
          break;
        }
        // optional int64 reshapeStart = 10;
        case 10: {
          message.reshapeStart = readVarint64(
            bb,
            /* unsigned */
            false
          );
          break;
        }
        default:
          skipUnknownField(bb, tag & 7);
      }
    }
    return message;
  }
  function pushTemporaryLength(bb) {
    let length = readVarint32(bb);
    let limit = bb.limit;
    bb.limit = bb.offset + length;
    return limit;
  }
  function skipUnknownField(bb, type) {
    switch (type) {
      case 0:
        while (readByte(bb) & 128) {
        }
        break;
      case 2:
        skip(bb, readVarint32(bb));
        break;
      case 5:
        skip(bb, 4);
        break;
      case 1:
        skip(bb, 8);
        break;
      default:
        throw new Error("Unimplemented type: " + type);
    }
  }
  function stringToLong(value) {
    return Long.fromString(value);
  }
  function longToString(value) {
    return value.toString();
  }
  var f32 = new Float32Array(1);
  var f32_u8 = new Uint8Array(f32.buffer);
  var f64 = new Float64Array(1);
  var f64_u8 = new Uint8Array(f64.buffer);
  var bbStack = [];
  function popByteBuffer() {
    const bb = bbStack.pop();
    if (!bb) return { bytes: new Uint8Array(64), offset: 0, limit: 0 };
    bb.offset = bb.limit = 0;
    return bb;
  }
  function pushByteBuffer(bb) {
    bbStack.push(bb);
  }
  function wrapByteBuffer(bytes) {
    return { bytes, offset: 0, limit: bytes.length };
  }
  function toUint8Array(bb) {
    let bytes = bb.bytes;
    let limit = bb.limit;
    return bytes.length === limit ? bytes : bytes.subarray(0, limit);
  }
  function skip(bb, offset) {
    if (bb.offset + offset > bb.limit) {
      throw new Error("Skip past limit");
    }
    bb.offset += offset;
  }
  function isAtEnd(bb) {
    return bb.offset >= bb.limit;
  }
  function grow(bb, count) {
    let bytes = bb.bytes;
    let offset = bb.offset;
    let limit = bb.limit;
    let finalOffset = offset + count;
    if (finalOffset > bytes.length) {
      let newBytes = new Uint8Array(finalOffset * 2);
      newBytes.set(bytes);
      bb.bytes = newBytes;
    }
    bb.offset = finalOffset;
    if (finalOffset > limit) {
      bb.limit = finalOffset;
    }
    return offset;
  }
  function advance(bb, count) {
    let offset = bb.offset;
    if (offset + count > bb.limit) {
      throw new Error("Read past limit");
    }
    bb.offset += count;
    return offset;
  }
  function readBytes(bb, count) {
    let offset = advance(bb, count);
    return bb.bytes.subarray(offset, offset + count);
  }
  function writeBytes(bb, buffer) {
    let offset = grow(bb, buffer.length);
    bb.bytes.set(buffer, offset);
  }
  function readString(bb, count) {
    let offset = advance(bb, count);
    let fromCharCode = String.fromCharCode;
    let bytes = bb.bytes;
    let invalid = "\uFFFD";
    let text = "";
    for (let i = 0; i < count; i++) {
      let c1 = bytes[i + offset], c2, c3, c4, c;
      if ((c1 & 128) === 0) {
        text += fromCharCode(c1);
      } else if ((c1 & 224) === 192) {
        if (i + 1 >= count) text += invalid;
        else {
          c2 = bytes[i + offset + 1];
          if ((c2 & 192) !== 128) text += invalid;
          else {
            c = (c1 & 31) << 6 | c2 & 63;
            if (c < 128) text += invalid;
            else {
              text += fromCharCode(c);
              i++;
            }
          }
        }
      } else if ((c1 & 240) == 224) {
        if (i + 2 >= count) text += invalid;
        else {
          c2 = bytes[i + offset + 1];
          c3 = bytes[i + offset + 2];
          if (((c2 | c3 << 8) & 49344) !== 32896) text += invalid;
          else {
            c = (c1 & 15) << 12 | (c2 & 63) << 6 | c3 & 63;
            if (c < 2048 || c >= 55296 && c <= 57343) text += invalid;
            else {
              text += fromCharCode(c);
              i += 2;
            }
          }
        }
      } else if ((c1 & 248) == 240) {
        if (i + 3 >= count) text += invalid;
        else {
          c2 = bytes[i + offset + 1];
          c3 = bytes[i + offset + 2];
          c4 = bytes[i + offset + 3];
          if (((c2 | c3 << 8 | c4 << 16) & 12632256) !== 8421504) text += invalid;
          else {
            c = (c1 & 7) << 18 | (c2 & 63) << 12 | (c3 & 63) << 6 | c4 & 63;
            if (c < 65536 || c > 1114111) text += invalid;
            else {
              c -= 65536;
              text += fromCharCode((c >> 10) + 55296, (c & 1023) + 56320);
              i += 3;
            }
          }
        }
      } else text += invalid;
    }
    return text;
  }
  function writeString(bb, text) {
    let n = text.length;
    let byteCount = 0;
    for (let i = 0; i < n; i++) {
      let c = text.charCodeAt(i);
      if (c >= 55296 && c <= 56319 && i + 1 < n) {
        c = (c << 10) + text.charCodeAt(++i) - 56613888;
      }
      byteCount += c < 128 ? 1 : c < 2048 ? 2 : c < 65536 ? 3 : 4;
    }
    writeVarint32(bb, byteCount);
    let offset = grow(bb, byteCount);
    let bytes = bb.bytes;
    for (let i = 0; i < n; i++) {
      let c = text.charCodeAt(i);
      if (c >= 55296 && c <= 56319 && i + 1 < n) {
        c = (c << 10) + text.charCodeAt(++i) - 56613888;
      }
      if (c < 128) {
        bytes[offset++] = c;
      } else {
        if (c < 2048) {
          bytes[offset++] = c >> 6 & 31 | 192;
        } else {
          if (c < 65536) {
            bytes[offset++] = c >> 12 & 15 | 224;
          } else {
            bytes[offset++] = c >> 18 & 7 | 240;
            bytes[offset++] = c >> 12 & 63 | 128;
          }
          bytes[offset++] = c >> 6 & 63 | 128;
        }
        bytes[offset++] = c & 63 | 128;
      }
    }
  }
  function writeByteBuffer(bb, buffer) {
    let offset = grow(bb, buffer.limit);
    let from = bb.bytes;
    let to = buffer.bytes;
    for (let i = 0, n = buffer.limit; i < n; i++) {
      from[i + offset] = to[i];
    }
  }
  function readByte(bb) {
    return bb.bytes[advance(bb, 1)];
  }
  function writeByte(bb, value) {
    let offset = grow(bb, 1);
    bb.bytes[offset] = value;
  }
  function readFloat(bb) {
    let offset = advance(bb, 4);
    let bytes = bb.bytes;
    f32_u8[0] = bytes[offset++];
    f32_u8[1] = bytes[offset++];
    f32_u8[2] = bytes[offset++];
    f32_u8[3] = bytes[offset++];
    return f32[0];
  }
  function readVarint32(bb) {
    let c = 0;
    let value = 0;
    let b;
    do {
      b = readByte(bb);
      if (c < 32) value |= (b & 127) << c;
      c += 7;
    } while (b & 128);
    return value;
  }
  function writeVarint32(bb, value) {
    value >>>= 0;
    while (value >= 128) {
      writeByte(bb, value & 127 | 128);
      value >>>= 7;
    }
    writeByte(bb, value);
  }
  function readVarint64(bb, unsigned) {
    let part0 = 0;
    let part1 = 0;
    let part2 = 0;
    let b;
    b = readByte(bb);
    part0 = b & 127;
    if (b & 128) {
      b = readByte(bb);
      part0 |= (b & 127) << 7;
      if (b & 128) {
        b = readByte(bb);
        part0 |= (b & 127) << 14;
        if (b & 128) {
          b = readByte(bb);
          part0 |= (b & 127) << 21;
          if (b & 128) {
            b = readByte(bb);
            part1 = b & 127;
            if (b & 128) {
              b = readByte(bb);
              part1 |= (b & 127) << 7;
              if (b & 128) {
                b = readByte(bb);
                part1 |= (b & 127) << 14;
                if (b & 128) {
                  b = readByte(bb);
                  part1 |= (b & 127) << 21;
                  if (b & 128) {
                    b = readByte(bb);
                    part2 = b & 127;
                    if (b & 128) {
                      b = readByte(bb);
                      part2 |= (b & 127) << 7;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    const res = new Long(part0 | part1 << 28, part1 >>> 4 | part2 << 24, unsigned);
    return longToString(res);
  }
  function writeVarint64(bb, value) {
    if (typeof value === "string") value = stringToLong(value);
    let part0 = value.low >>> 0;
    let part1 = (value.low >>> 28 | value.high << 4) >>> 0;
    let part2 = value.high >>> 24;
    let size = part2 === 0 ? part1 === 0 ? part0 < 1 << 14 ? part0 < 1 << 7 ? 1 : 2 : part0 < 1 << 21 ? 3 : 4 : part1 < 1 << 14 ? part1 < 1 << 7 ? 5 : 6 : part1 < 1 << 21 ? 7 : 8 : part2 < 1 << 7 ? 9 : 10;
    let offset = grow(bb, size);
    let bytes = bb.bytes;
    switch (size) {
      case 10:
        bytes[offset + 9] = part2 >>> 7 & 1;
      case 9:
        bytes[offset + 8] = size !== 9 ? part2 | 128 : part2 & 127;
      case 8:
        bytes[offset + 7] = size !== 8 ? part1 >>> 21 | 128 : part1 >>> 21 & 127;
      case 7:
        bytes[offset + 6] = size !== 7 ? part1 >>> 14 | 128 : part1 >>> 14 & 127;
      case 6:
        bytes[offset + 5] = size !== 6 ? part1 >>> 7 | 128 : part1 >>> 7 & 127;
      case 5:
        bytes[offset + 4] = size !== 5 ? part1 | 128 : part1 & 127;
      case 4:
        bytes[offset + 3] = size !== 4 ? part0 >>> 21 | 128 : part0 >>> 21 & 127;
      case 3:
        bytes[offset + 2] = size !== 3 ? part0 >>> 14 | 128 : part0 >>> 14 & 127;
      case 2:
        bytes[offset + 1] = size !== 2 ? part0 >>> 7 | 128 : part0 >>> 7 & 127;
      case 1:
        bytes[offset] = size !== 1 ? part0 | 128 : part0 & 127;
    }
  }

  // danmu-src/abogus.js
  var getAbogus = function(query, ua) {
    function enc_sum(n_str) {
      function ir(t) {
        return ir = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(t5) {
          return typeof t5;
        } : function(t5) {
          return t5 && "function" == typeof Symbol && t5.constructor === Symbol && t5 !== Symbol.prototype ? "symbol" : typeof t5;
        }, ir(t);
      }
      function ur(t, r) {
        for (let e = 0; e < r.length; e++) {
          const n = r[e];
          n.enumerable = n.enumerable || false, n.configurable = true, "value" in n && (n.writable = true), Object.defineProperty(t, sr(n.key), n);
        }
      }
      function sr(t) {
        const r = (function(t5, r2) {
          if ("object" != ir(t5) || !t5) return t5;
          const e = t5[Symbol.toPrimitive];
          if (void 0 !== e) {
            const n = e.call(t5, r2 || "default");
            if ("object" != ir(n)) return n;
            throw new TypeError("@@toPrimitive must return a primitive value.");
          }
          return ("string" === r2 ? String : Number)(t5);
        })(t, "string");
        return "symbol" == ir(r) ? r : r + "";
      }
      const gr = (function() {
        function t() {
          if ((function(t5, r) {
            if (!(t5 instanceof r)) throw new TypeError("Cannot call a class as a function");
          })(this, t), !(this instanceof t))
            return new t();
          this.reg = new Array(8), this.chunk = [], this.size = 0, this.reset();
        }
        return (function(t5, r, e) {
          r && ur(t5.prototype, r), e && ur(t5, e), Object.defineProperty(t5, "prototype", {
            writable: false
          });
        })(t, [
          {
            key: "reset",
            value: function() {
              this.reg[0] = 1937774191, this.reg[1] = 1226093241, this.reg[2] = 388252375, this.reg[3] = 3666478592, this.reg[4] = 2842636476, this.reg[5] = 372324522, this.reg[6] = 3817729613, this.reg[7] = 2969243214, this.chunk = [], this.size = 0;
            }
          },
          {
            key: "write",
            value: function(t5) {
              const r = "string" == typeof t5 ? (function(t6) {
                const r2 = encodeURIComponent(t6).replace(/%([0-9A-F]{2})/g, function(t7, r3) {
                  return String.fromCharCode("0x" + r3);
                }), e2 = new Array(r2.length);
                return Array.prototype.forEach.call(r2, function(t7, r3) {
                  e2[r3] = t7.charCodeAt(0);
                }), e2;
              })(t5) : t5;
              this.size += r.length;
              let e = 64 - this.chunk.length;
              if (r.length < e) this.chunk = this.chunk.concat(r);
              else
                for (this.chunk = this.chunk.concat(r.slice(0, e)); this.chunk.length >= 64; )
                  this._compress(this.chunk), e < r.length ? this.chunk = r.slice(e, Math.min(e + 64, r.length)) : this.chunk = [], e += 64;
            }
          },
          {
            key: "sum",
            value: function(t5, r) {
              t5 && (this.reset(), this.write(t5)), this._fill();
              let e = 0;
              for (; e < this.chunk.length; e += 64) this._compress(this.chunk.slice(e, e + 64));
              let n, o, i, u = null;
              if ("hex" == r) {
                u = "";
                for (e = 0; e < 8; e++)
                  u += (n = this.reg[e].toString(16), o = 8, i = "0", n.length >= o ? n : i.repeat(o - n.length) + n);
              } else
                for (u = new Array(32), e = 0; e < 8; e++) {
                  let s9 = this.reg[e];
                  u[4 * e + 3] = (255 & s9) >>> 0, s9 >>>= 8, u[4 * e + 2] = (255 & s9) >>> 0, s9 >>>= 8, u[4 * e + 1] = (255 & s9) >>> 0, s9 >>>= 8, u[4 * e] = (255 & s9) >>> 0;
                }
              return this.reset(), u;
            }
          },
          {
            key: "_compress",
            value: function(t5) {
              if (t5 < 64) console.error("compress error: not enough data");
              else {
                let r = (function(t6) {
                  const r2 = new Array(132);
                  for (let e2 = 0; e2 < 16; e2++) {
                    r2[e2] = t6[4 * e2] << 24;
                    r2[e2] |= t6[4 * e2 + 1] << 16;
                    r2[e2] |= t6[4 * e2 + 2] << 8;
                    r2[e2] |= t6[4 * e2 + 3];
                    r2[e2] >>>= 0;
                  }
                  for (let n = 16; n < 68; n++) {
                    let o = r2[n - 16] ^ r2[n - 9] ^ dr(r2[n - 3], 15);
                    o = o ^ dr(o, 15) ^ dr(o, 23);
                    r2[n] = (o ^ dr(r2[n - 13], 7) ^ r2[n - 6]) >>> 0;
                  }
                  for (let n = 0; n < 64; n++) r2[n + 68] = (r2[n] ^ r2[n + 4]) >>> 0;
                  return r2;
                })(t5);
                let e = this.reg.slice(0);
                for (let n = 0; n < 64; n++) {
                  let o = dr(e[0], 12) + e[4] + dr(yr(n), n), i = ((o = dr(o = (4294967295 & o) >>> 0, 7)) ^ dr(e[0], 12)) >>> 0, u = br(n, e[0], e[1], e[2]);
                  u = (4294967295 & (u = u + e[3] + i + r[n + 68])) >>> 0;
                  let s9 = mr(n, e[4], e[5], e[6]);
                  s9 = (4294967295 & (s9 = s9 + e[7] + o + r[n])) >>> 0;
                  e[3] = e[2];
                  e[2] = dr(e[1], 9);
                  e[1] = e[0];
                  e[0] = u;
                  e[7] = e[6];
                  e[6] = dr(e[5], 19);
                  e[5] = e[4];
                  e[4] = (s9 ^ dr(s9, 9) ^ dr(s9, 17)) >>> 0;
                }
                for (let c = 0; c < 8; c++) this.reg[c] = (this.reg[c] ^ e[c]) >>> 0;
              }
            }
          },
          {
            key: "_fill",
            value: function() {
              let t5 = 8 * this.size, r = this.chunk.push(128) % 64;
              for (64 - r < 8 && (r -= 64); r < 56; r++) this.chunk.push(0);
              for (let e = 0; e < 4; e++) {
                let n = Math.floor(t5 / 4294967296);
                this.chunk.push(n >>> 8 * (3 - e) & 255);
              }
              for (let e = 0; e < 4; e++) this.chunk.push(t5 >>> 8 * (3 - e) & 255);
            }
          }
        ]), t;
      })();
      function dr(t, r) {
        return (t << (r %= 32) | t >>> 32 - r) >>> 0;
      }
      function yr(t) {
        return 0 <= t && t < 16 ? 2043430169 : 16 <= t && t < 64 ? 2055708042 : void console.error("invalid j for constant Tj");
      }
      function br(t, r, e, n) {
        return 0 <= t && t < 16 ? (r ^ e ^ n) >>> 0 : 16 <= t && t < 64 ? (r & e | r & n | e & n) >>> 0 : (console.error("invalid j for bool function FF"), 0);
      }
      function mr(t, r, e, n) {
        return 0 <= t && t < 16 ? (r ^ e ^ n) >>> 0 : 16 <= t && t < 64 ? (r & e | ~r & n) >>> 0 : (console.error("invalid j for bool function GG"), 0);
      }
      const enc_ = new gr();
      return enc_.sum(n_str);
    }
    function generate_lm_g_EP(uat = ua) {
      function get_sz256f() {
        let r = [], k2 = 0, y = [0, 1, 0];
        for (let i = 255; i >= 0; i--) {
          r.push(i);
        }
        for (let i = 0; i < r.length; i++) {
          let a = r[i];
          k2 = (k2 * a + k2 + y[i % 3]) % 256;
          let b = r[k2];
          r[i] = b, r[k2] = a;
        }
        return r;
      }
      const sz256f = [
        233,
        5,
        1,
        249,
        162,
        140,
        57,
        143,
        19,
        203,
        254,
        236,
        99,
        248,
        93,
        213,
        79,
        149,
        216,
        50,
        145,
        123,
        240,
        92,
        23,
        113,
        130,
        53,
        235,
        220,
        201,
        136,
        223,
        155,
        190,
        242,
        243,
        42,
        52,
        214,
        151,
        232,
        97,
        187,
        163,
        222,
        30,
        78,
        47,
        71,
        49,
        170,
        247,
        196,
        25,
        156,
        183,
        182,
        217,
        180,
        147,
        124,
        208,
        69,
        215,
        200,
        161,
        154,
        91,
        60,
        133,
        224,
        119,
        164,
        221,
        45,
        98,
        40,
        186,
        120,
        51,
        167,
        38,
        90,
        194,
        212,
        129,
        56,
        87,
        195,
        144,
        44,
        75,
        84,
        81,
        13,
        197,
        245,
        36,
        250,
        115,
        100,
        105,
        252,
        206,
        103,
        112,
        202,
        114,
        138,
        192,
        21,
        116,
        173,
        181,
        29,
        82,
        125,
        141,
        16,
        211,
        131,
        225,
        118,
        31,
        101,
        77,
        146,
        135,
        150,
        62,
        66,
        67,
        176,
        0,
        41,
        46,
        59,
        107,
        178,
        43,
        26,
        189,
        128,
        8,
        207,
        166,
        110,
        3,
        229,
        85,
        54,
        63,
        11,
        32,
        4,
        234,
        142,
        72,
        58,
        33,
        231,
        12,
        230,
        102,
        86,
        70,
        159,
        226,
        65,
        237,
        34,
        244,
        76,
        132,
        122,
        111,
        95,
        179,
        152,
        175,
        18,
        177,
        6,
        126,
        193,
        219,
        74,
        134,
        2,
        61,
        251,
        191,
        168,
        209,
        241,
        137,
        165,
        88,
        238,
        160,
        174,
        153,
        157,
        199,
        48,
        22,
        64,
        246,
        7,
        139,
        55,
        27,
        188,
        148,
        204,
        127,
        171,
        89,
        37,
        172,
        205,
        121,
        20,
        28,
        17,
        169,
        15,
        227,
        117,
        80,
        218,
        198,
        10,
        106,
        9,
        39,
        210,
        104,
        83,
        109,
        24,
        108,
        228,
        184,
        96,
        185,
        158,
        14,
        255,
        239,
        68,
        94,
        35,
        73,
        253
      ];
      let k = 0, s9 = "";
      for (let i = 0; i < uat.length; i++) {
        let t = (i + 1) % 256;
        let a = sz256f[t];
        k = (k + a) % 256;
        let c = sz256f[k];
        sz256f[t] = c;
        sz256f[k] = a;
        s9 += String.fromCharCode(uat.charCodeAt(i) ^ sz256f[(a + c) % 256]);
      }
      return s9;
    }
    function get_str_chr_list(one_str) {
      const r = [];
      for (let i = 0; i < one_str.length; i++) {
        r.push(one_str.charCodeAt(i));
      }
      return r;
    }
    function generate_szenc_head8p1() {
      let z = Math.random() * 65535;
      let a = z & 255;
      let b = z >> 8 & 255, d = [];
      d.push(a & 170 | 1);
      d.push(a & 85 | 0);
      d.push(b & 170 | 0);
      d.push(b & 85 | 0);
      return d;
    }
    function generate_szenc_head8p2() {
      let a = (Math.random() * 240 >> 0) + 1;
      let b = Math.random() * 255 >> 0 & 77, c = [1, 4, 5, 7], d = [];
      for (let i = 0; i < c.length; i++) {
        b = b | 1 << c[i];
      }
      d.push(a & 170 | 1);
      d.push(a & 85 | 0);
      d.push(b & 170 | 0);
      d.push(b & 85 | 0);
      return d;
    }
    function get_szenc_tail(sz96) {
      const zKeys = [145, 110, 66, 189, 44, 211];
      const a = [];
      for (let i = 0; i < 94; i += 3) {
        let b = sz96[i];
        let c = sz96[i + 1];
        let d = sz96[i + 2];
        let e = Math.random() * 1e3 & 255;
        a.push(e & zKeys[0] | b & zKeys[1]);
        a.push(e & zKeys[2] | c & zKeys[3]);
        a.push(e & zKeys[4] | d & zKeys[5]);
        a.push(b & zKeys[0] | c & zKeys[2] | d & zKeys[4]);
      }
      return a;
    }
    function generate_lm_g_ab_head4() {
      let s9 = "";
      const a = Math.random() * 65535 & 255, b = Math.random() * 40 >> 0;
      s9 += String.fromCharCode(a & 170 | 1);
      s9 += String.fromCharCode(a & 85 | 2);
      s9 += String.fromCharCode(b & 170 | 80);
      s9 += String.fromCharCode(b & 85 | 2);
      return s9;
    }
    function get_list_str(one_list) {
      let s9 = "";
      for (let i = 0; i < one_list.length; i++) {
        s9 += String.fromCharCode(one_list[i]);
      }
      return s9;
    }
    function get_lm_g_ab(lm_g_lm_n) {
      function getSZ256() {
        const raw = [];
        let z2 = 0;
        for (let i = 255; i >= 0; i--) {
          raw.push(i);
        }
        for (let i = 0; i < raw.length; i++) {
          z2 += 211;
          let a = z2 % 256;
          let b = raw[i];
          let c = raw[a];
          raw[a] = b;
          raw[i] = c;
          z2 = raw[i + 1] * a + a;
        }
        return raw;
      }
      const fixedSZ256 = [
        194,
        249,
        255,
        165,
        114,
        67,
        251,
        187,
        174,
        231,
        164,
        237,
        124,
        235,
        68,
        83,
        206,
        79,
        142,
        167,
        30,
        77,
        0,
        93,
        118,
        29,
        32,
        161,
        2,
        171,
        243,
        179,
        42,
        170,
        223,
        119,
        98,
        222,
        219,
        57,
        245,
        135,
        197,
        13,
        186,
        202,
        88,
        184,
        214,
        12,
        76,
        185,
        116,
        74,
        54,
        53,
        104,
        208,
        158,
        163,
        82,
        173,
        253,
        240,
        172,
        63,
        191,
        207,
        25,
        15,
        201,
        203,
        215,
        236,
        183,
        233,
        145,
        127,
        72,
        6,
        16,
        10,
        228,
        35,
        232,
        159,
        66,
        168,
        108,
        71,
        217,
        75,
        33,
        155,
        112,
        128,
        36,
        24,
        138,
        50,
        211,
        23,
        107,
        14,
        247,
        137,
        175,
        242,
        234,
        157,
        199,
        49,
        139,
        85,
        81,
        17,
        180,
        86,
        120,
        78,
        51,
        205,
        169,
        148,
        181,
        3,
        94,
        106,
        252,
        220,
        150,
        47,
        151,
        84,
        212,
        18,
        149,
        182,
        100,
        123,
        121,
        156,
        154,
        152,
        126,
        204,
        60,
        133,
        132,
        248,
        7,
        91,
        58,
        59,
        20,
        97,
        113,
        117,
        131,
        46,
        250,
        224,
        21,
        73,
        146,
        31,
        193,
        69,
        140,
        125,
        9,
        39,
        89,
        5,
        65,
        141,
        218,
        80,
        1,
        70,
        64,
        166,
        87,
        189,
        55,
        147,
        22,
        26,
        143,
        61,
        144,
        99,
        92,
        44,
        129,
        130,
        227,
        103,
        90,
        192,
        198,
        244,
        136,
        101,
        246,
        153,
        56,
        38,
        4,
        178,
        221,
        162,
        134,
        37,
        111,
        28,
        216,
        96,
        102,
        210,
        254,
        196,
        195,
        230,
        241,
        62,
        11,
        122,
        52,
        40,
        41,
        229,
        226,
        225,
        48,
        45,
        160,
        105,
        8,
        115,
        34,
        43,
        209,
        95,
        239,
        190,
        188,
        109,
        27,
        19,
        176,
        213,
        200,
        238,
        177,
        110
      ];
      let z = 0;
      let st = "";
      for (let i = 0; i < lm_g_lm_n.length; i++) {
        let a = (i + 1) % 256;
        let c = fixedSZ256[a];
        z = (z + c) % 256;
        let e = fixedSZ256[z];
        fixedSZ256[a] = e;
        fixedSZ256[z] = c;
        let g = (e + c) % 256;
        let h = lm_g_lm_n.charCodeAt(i);
        let j = fixedSZ256[g];
        let k = h ^ j;
        let l = String.fromCharCode(k);
        st += l;
      }
      return st;
    }
    function get_raw_ab(lm_get_ab_n, key_str = info_dic.s4) {
      let s9 = "", bw = 0;
      for (let i = 0; i < lm_get_ab_n.length; i += 3) {
        let cl = 16;
        let tcz = 0;
        let sof = 16515072;
        for (let j = i; j < i + 3; j++) {
          if (j < lm_get_ab_n.length) {
            let tlcy = lm_get_ab_n.charCodeAt(j) & 255;
            tcz = tcz | tlcy << cl;
            cl -= 8;
          } else {
            bw += 1;
          }
        }
        for (let h = 18; h >= 6 * bw; h -= 6) {
          let tsz = tcz & sof;
          s9 += key_str[tsz >> h];
          sof = sof / 64;
        }
        s9 += "=".repeat(bw);
      }
      return s9;
    }
    function get_random_number(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    const info_dic = {
      s0: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
      s1: "Dkdpgh4ZKsQB80/Mfvw36XI1R25+WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=",
      s2: "Dkdpgh4ZKsQB80/Mfvw36XI1R25-WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=",
      s3: "ckdp1h4ZKsUB80/Mfvw36XIgR25+WQAlEi7NLboqYTOPuzmFjJnryx9HVGDaStCe",
      s4: "Dkdpgh2ZmsQB80/MfvV36XI1R45-WUAlEixNLwoqYTOPuzKFjJnry79HbGcaStCe"
    };
    const t1 = Date.now();
    const s = [];
    const t2 = Date.now() - 1 + get_random_number(1, 3);
    const EP = get_raw_ab(generate_lm_g_EP(ua), info_dic.s3);
    const eEP = enc_sum(EP);
    s.push("env_fx_list", "dpf_ua_dic", 1, 0, 8, "dpf", "", "ua", 6241, 6383, "1.0.1.19-fix.01", "ink", 3, "0X21_dic");
    const t3 = Date.now() + get_random_number(4, 15);
    const eedp = enc_sum(enc_sum(query + "dhzx"));
    s.push(t3, "reg_dic", 1, 0, eedp, "eedh", EP, eEP, t2, [3, 82], 41, [1, 0, 1, 0, 1]);
    const t4 = Date.now() + get_random_number(100, 1e3);
    const s1 = (t4 - 17218368e5) / 1e3 / 60 / 60 / 24 / 14 >> 0, szenc_o95_tail41 = [
      49,
      52,
      52,
      49,
      124,
      56,
      51,
      56,
      124,
      49,
      52,
      52,
      49,
      124,
      57,
      49,
      51,
      124,
      49,
      52,
      52,
      49,
      124,
      57,
      49,
      51,
      124,
      49,
      52,
      52,
      49,
      124,
      57,
      54,
      49,
      124,
      87,
      105,
      110,
      51,
      50
    ];
    s.push(
      s1,
      6,
      t3 - t1 + 3 & 255,
      t3 & 255,
      t3 >> 8 & 255,
      t3 >> 16 & 255,
      t3 >> 24 & 255,
      t3 / 256 / 256 / 256 / 256 & 255
    );
    const s2 = t3 / 256 / 256 / 256 / 256 / 256 & 255;
    s.push(
      s2,
      s2 % 256 & 255,
      s2 / 256 & 255,
      [211, 2, 5, 1, 129],
      129,
      0,
      211,
      2,
      5,
      1,
      0,
      0,
      0,
      0,
      eedp[9],
      eedp[18],
      3,
      eedp[3],
      82,
      177,
      4,
      44,
      eEP[11],
      eEP[21],
      5,
      eEP[5],
      t2 & 255,
      t2 >> 8 & 255,
      t2 >> 16 & 255,
      t2 >> 24 & 255,
      t2 / 256 / 256 / 256 / 256 & 255,
      t2 / 256 / 256 / 256 / 256 / 256 & 255,
      3,
      97,
      24,
      0,
      0,
      239,
      24,
      0,
      0,
      "screec_dic",
      "screen_str",
      szenc_o95_tail41,
      41,
      41,
      0
    );
    const s3 = (t3 + 3 & 255) + ",", s4 = get_str_chr_list(s3);
    s.push(s3, s4, s4.length, s4.length & 255, s4.length >> 8 & 255);
    const szenc_head8_p1 = generate_szenc_head8p1(), szenc_head8_p2 = generate_szenc_head8p2(), szenc_head8 = szenc_head8_p1.concat(szenc_head8_p2), s5 = [], s6 = [
      24,
      26,
      27,
      28,
      29,
      30,
      31,
      32,
      33,
      34,
      35,
      36,
      38,
      39,
      40,
      41,
      42,
      43,
      44,
      45,
      46,
      47,
      48,
      49,
      51,
      52,
      53,
      55,
      56,
      57,
      59,
      60,
      61,
      62,
      63,
      64,
      65,
      66,
      67,
      68,
      69,
      70,
      71,
      72,
      73,
      74,
      79,
      80,
      84,
      85
    ];
    for (let i = 0; i < s6.length; i++) {
      s5.push(s[s6[i]]);
    }
    s.push(szenc_head8);
    const s7 = szenc_head8.concat(s5);
    let s8 = s7[0];
    for (let i = 1; i < s7.length; i++) {
      s8 = s8 ^ s7[i];
    }
    s.push(s8);
    const enc_s_i = [
      34,
      44,
      56,
      61,
      73,
      29,
      70,
      45,
      35,
      49,
      38,
      66,
      51,
      68,
      28,
      48,
      64,
      47,
      30,
      71,
      26,
      55,
      31,
      69,
      59,
      40,
      62,
      63,
      27,
      72,
      41,
      74,
      57,
      52,
      42,
      39,
      33,
      67,
      53,
      43,
      65,
      46,
      36,
      24,
      60,
      32,
      79,
      80,
      84,
      85
    ], szenc_o95_head50 = [];
    for (let i = 0; i < enc_s_i.length; i++) {
      szenc_o95_head50.push(s[enc_s_i[i]]);
    }
    let szenc_o95 = [];
    szenc_o95 = szenc_o95.concat(szenc_o95_head50, szenc_o95_tail41, s4, [s8]);
    const szenc_tail = get_szenc_tail(szenc_o95), szenc = szenc_head8.concat(szenc_tail), lm_get_ab_head4 = generate_lm_g_ab_head4();
    const lm_get_lm = get_list_str(szenc);
    const lm_get_ab_tail = get_lm_g_ab(lm_get_lm);
    const lm_get_ab = lm_get_ab_head4 + lm_get_ab_tail;
    const ab = get_raw_ab(lm_get_ab);
    return ab;
  };

  // danmu-src/signature.js
  var stringToBytes = function(t) {
    t = decodeURIComponent(encodeURIComponent(t));
    let n = [];
    for (let e = 0; e < t.length; e++) n.push(255 & t.charCodeAt(e));
    return n;
  };
  var bytesToWords = function(t) {
    let n = [];
    for (let e = 0, p = 0; e < t.length; e++, p += 8) n[p >>> 5] |= t[e] << 24 - p % 32;
    return n;
  };
  var wordsToBytes = function(t) {
    let n = [];
    for (let e = 0; e < 32 * t.length; e += 8) n.push(t[e >>> 5] >>> 24 - e % 32 & 255);
    return n;
  };
  var bytesToHex = function(t) {
    let n = [];
    for (let e = 0; e < t.length; e++) n.push((t[e] >>> 4).toString(16)), n.push((15 & t[e]).toString(16));
    return n.join("");
  };
  var _ff = function(t, n, e, p, r, o, i) {
    var u = t + (n & e | ~n & p) + (r >>> 0) + i;
    return (u << o | u >>> 32 - o) + n;
  };
  var _gg = function(t, n, e, p, r, o, i) {
    var u = t + (n & p | e & ~p) + (r >>> 0) + i;
    return (u << o | u >>> 32 - o) + n;
  };
  var _hh = function(t, n, e, p, r, o, i) {
    var u = t + (n ^ e ^ p) + (r >>> 0) + i;
    return (u << o | u >>> 32 - o) + n;
  };
  var _ii = function(t, n, e, p, r, o, i) {
    var u = t + (e ^ (n | ~p)) + (r >>> 0) + i;
    return (u << o | u >>> 32 - o) + n;
  };
  var rotl = function(t, n) {
    return t << n | t >>> 32 - n;
  };
  var endian = function(t) {
    if (t.constructor == Number) return 16711935 & rotl(t, 8) | 4278255360 & rotl(t, 24);
    for (let n = 0; n < t.length; n++) t[n] = endian(t[n]);
    return t;
  };
  function un(t, n) {
    t = stringToBytes(t);
    let e = bytesToWords(t), r = 8 * t.length, o = 1732584193, i = -271733879, u = -1732584194, l = 271733878;
    for (let t2 = 0; t2 < e.length; t2++)
      e[t2] = 16711935 & (e[t2] << 8 | e[t2] >>> 24) | 4278255360 & (e[t2] << 24 | e[t2] >>> 8);
    e[r >>> 5] |= 128 << r % 32, e[14 + (r + 64 >>> 9 << 4)] = r;
    let f = _ff, s = _gg, c = _hh, d = _ii;
    for (let p = 0; p < e.length; p += 16) {
      let g = o, _ = i, h = u, a = l;
      o = d(
        o = c(
          o = c(
            o = c(
              o = c(
                o = s(
                  o = s(
                    o = s(
                      o = s(
                        o = f(
                          o = f(
                            o = f(
                              o = f(o, i, u, l, e[p + 0], 7, -680876936),
                              i = f(
                                i,
                                u = f(u, l = f(l, o, i, u, e[p + 1], 12, -389564586), o, i, e[p + 2], 17, 606105819),
                                l,
                                o,
                                e[p + 3],
                                22,
                                -1044525330
                              ),
                              u,
                              l,
                              e[p + 4],
                              7,
                              -176418897
                            ),
                            i = f(
                              i,
                              u = f(u, l = f(l, o, i, u, e[p + 5], 12, 1200080426), o, i, e[p + 6], 17, -1473231341),
                              l,
                              o,
                              e[p + 7],
                              22,
                              -45705983
                            ),
                            u,
                            l,
                            e[p + 8],
                            7,
                            1770035416
                          ),
                          i = f(
                            i,
                            u = f(u, l = f(l, o, i, u, e[p + 9], 12, -1958414417), o, i, e[p + 10], 17, -42063),
                            l,
                            o,
                            e[p + 11],
                            22,
                            -1990404162
                          ),
                          u,
                          l,
                          e[p + 12],
                          7,
                          1804603682
                        ),
                        i = f(
                          i,
                          u = f(u, l = f(l, o, i, u, e[p + 13], 12, -40341101), o, i, e[p + 14], 17, -1502002290),
                          l,
                          o,
                          e[p + 15],
                          22,
                          1236535329
                        ),
                        u,
                        l,
                        e[p + 1],
                        5,
                        -165796510
                      ),
                      i = s(
                        i,
                        u = s(u, l = s(l, o, i, u, e[p + 6], 9, -1069501632), o, i, e[p + 11], 14, 643717713),
                        l,
                        o,
                        e[p + 0],
                        20,
                        -373897302
                      ),
                      u,
                      l,
                      e[p + 5],
                      5,
                      -701558691
                    ),
                    i = s(
                      i,
                      u = s(u, l = s(l, o, i, u, e[p + 10], 9, 38016083), o, i, e[p + 15], 14, -660478335),
                      l,
                      o,
                      e[p + 4],
                      20,
                      -405537848
                    ),
                    u,
                    l,
                    e[p + 9],
                    5,
                    568446438
                  ),
                  i = s(
                    i,
                    u = s(u, l = s(l, o, i, u, e[p + 14], 9, -1019803690), o, i, e[p + 3], 14, -187363961),
                    l,
                    o,
                    e[p + 8],
                    20,
                    1163531501
                  ),
                  u,
                  l,
                  e[p + 13],
                  5,
                  -1444681467
                ),
                i = s(
                  i,
                  u = s(u, l = s(l, o, i, u, e[p + 2], 9, -51403784), o, i, e[p + 7], 14, 1735328473),
                  l,
                  o,
                  e[p + 12],
                  20,
                  -1926607734
                ),
                u,
                l,
                e[p + 5],
                4,
                -378558
              ),
              i = c(
                i,
                u = c(u, l = c(l, o, i, u, e[p + 8], 11, -2022574463), o, i, e[p + 11], 16, 1839030562),
                l,
                o,
                e[p + 14],
                23,
                -35309556
              ),
              u,
              l,
              e[p + 1],
              4,
              -1530992060
            ),
            i = c(
              i,
              u = c(u, l = c(l, o, i, u, e[p + 4], 11, 1272893353), o, i, e[p + 7], 16, -155497632),
              l,
              o,
              e[p + 10],
              23,
              -1094730640
            ),
            u,
            l,
            e[p + 13],
            4,
            681279174
          ),
          i = c(
            i,
            u = c(u, l = c(l, o, i, u, e[p + 0], 11, -358537222), o, i, e[p + 3], 16, -722521979),
            l,
            o,
            e[p + 6],
            23,
            76029189
          ),
          u,
          l,
          e[p + 9],
          4,
          -640364487
        ),
        i = c(
          i,
          u = c(u, l = c(l, o, i, u, e[p + 12], 11, -421815835), o, i, e[p + 15], 16, 530742520),
          l,
          o,
          e[p + 2],
          23,
          -995338651
        ),
        u,
        l,
        e[p + 0],
        6,
        -198630844
      ), i = d(
        i = d(
          i = d(
            i = d(
              i,
              u = d(u, l = d(l, o, i, u, e[p + 7], 10, 1126891415), o, i, e[p + 14], 15, -1416354905),
              l,
              o,
              e[p + 5],
              21,
              -57434055
            ),
            u = d(
              u,
              l = d(l, o = d(o, i, u, l, e[p + 12], 6, 1700485571), i, u, e[p + 3], 10, -1894986606),
              o,
              i,
              e[p + 10],
              15,
              -1051523
            ),
            l,
            o,
            e[p + 1],
            21,
            -2054922799
          ),
          u = d(
            u,
            l = d(l, o = d(o, i, u, l, e[p + 8], 6, 1873313359), i, u, e[p + 15], 10, -30611744),
            o,
            i,
            e[p + 6],
            15,
            -1560198380
          ),
          l,
          o,
          e[p + 13],
          21,
          1309151649
        ),
        u = d(
          u,
          l = d(l, o = d(o, i, u, l, e[p + 4], 6, -145523070), i, u, e[p + 11], 10, -1120210379),
          o,
          i,
          e[p + 2],
          15,
          718787259
        ),
        l,
        o,
        e[p + 9],
        21,
        -343485551
      ), o = o + g >>> 0, i = i + _ >>> 0, u = u + h >>> 0, l = l + a >>> 0;
    }
    return endian([o, i, u, l]);
  }
  function getSTUB(t) {
    let n = wordsToBytes(un(t));
    return bytesToHex(n);
  }
  var getSignature = function(roomId, uniqueId) {
    const sdkVersion = VERSION;
    const e = getSTUB(
      `live_id=1,aid=6383,version_code=180800,webcast_sdk_version=${sdkVersion},room_id=${roomId},sub_room_id=,sub_channel_id=,did_rule=3,user_unique_id=${uniqueId},device_platform=web,device_type=,ac=,identity=audience`
    );
    const res = window.byted_acrawler.frontierSign({
      "X-MS-STUB": e
    });
    return res["X-Bogus"] || "";
  };
  var getMsToken = function(length = 182) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_=";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // danmu-src/util.ts
  var parseLiveHtml = function(html) {
    try {
      let extractJsonField = function(name, json2) {
        const reg = REGMAP[name];
        let res = "";
        if (reg) {
          const exec = reg.exec(json2);
          if (exec) res = exec[1];
        }
        return res;
      }, decodeUnicodeUrl = function(url) {
        if (url) return url.replace(/\\u0026/g, "&");
        else return url;
      };
      const matchRes = html.match(
        /<script\snonce="\S+?"\s>self\.__pace_f\.push\(\[1,"[a-z]?:\[\\"\$\\",\\"\$L\d+\\",null,([\s\S]+?state[\s\S]+?)\]\\n"\]\)<\/script>/
      );
      if (!matchRes) return null;
      let json = matchRes[1];
      const REGMAP = {
        roomId: /{"state":{[\s\S]*?"roomStore":{[\s\S]*?"roomInfo":{[\s\S]*?"roomId":"([0-9]+?)"/,
        uniqueId: /{"state":{[\s\S]*?"userStore":{[\s\S]*?"odin":{[\s\S]*?"user_unique_id":"([0-9]+?)"/,
        avatar: /{"state":{[\s\S]*?"roomStore":{[\s\S]*?"roomInfo":{[\s\S]*?"anchor":{[\s\S]*?"avatar_thumb":{[\s\S]*?"url_list":\["([\S]+?)"/,
        cover: /{"state":{[\s\S]*?"roomStore":{[\s\S]*?"roomInfo":{[\s\S]*?"room":{[\s\S]*?"cover":{[\s\S]*?"url_list":\["([\S]+?)"/,
        nickname: /{"state":{[\s\S]*?"roomStore":{[\s\S]*?"roomInfo":{[\s\S]*?"anchor":{[\s\S]*?"nickname":"([\s\S]+?)"/,
        title: /{"state":{[\s\S]*?"roomStore":{[\s\S]*?"roomInfo":{[\s\S]*?"room":{[\s\S]*?"title":"([\s\S]+?)"/,
        status: /{"state":{[\s\S]*?"roomStore":{[\s\S]*?"roomInfo":{[\s\S]*?"room":{[\s\S]*?"status":([0-9]{1})/
      };
      json = json.replace(/\\{1,7}"/g, '"');
      const roomId = extractJsonField("roomId", json);
      const uniqueId = extractJsonField("uniqueId", json);
      const avatar = extractJsonField("avatar", json);
      const cover = extractJsonField("cover", json);
      const nickname = extractJsonField("nickname", json);
      const title = extractJsonField("title", json);
      const status = extractJsonField("status", json);
      return {
        roomId,
        uniqueId,
        avatar: decodeUnicodeUrl(avatar),
        cover: decodeUnicodeUrl(cover),
        nickname,
        title,
        status: parseInt(status || "4")
      };
    } catch (err) {
      return null;
    }
  };
  var makeUrlParams = function(params) {
    return Object.keys(params).reduce((t, n) => {
      let r;
      return `${t}${t ? "&" : ""}${n}=${null != (r = params[n]) ? r : ""}`;
    }, "");
  };

  // danmu-src/request.ts
  var fetchLiveInfo = async function(id) {
    try {
      const html = await fetch(`/${id}`).then((res) => res.text());
      return html;
    } catch (err) {
      return Promise.reject(Error("Fetch Live Info Error"));
    }
  };
  var getLiveInfo = async function(id) {
    try {
      const html = await fetchLiveInfo(id);
      const first = parseLiveHtml(html);
      if (first) return first;
      else {
        const realHtml = await fetchLiveInfo(id);
        const second = parseLiveHtml(realHtml);
        if (second) return second;
        else throw new Error("Get Live Info Error");
      }
    } catch (err) {
      return Promise.reject(err);
    }
  };
  var fetchUser = async function() {
    try {
      await fetch(`/webcast/user/`, {
        method: "HEAD",
        headers: {
          "X-Secsdk-Csrf-Request": "1",
          "X-Secsdk-Csrf-Version": "1.2.22"
        }
      });
    } catch (err) {
      return Promise.reject(Error("Fetch Webcast User Error"));
    }
  };
  var USER_AGENT = navigator.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
  var BROWSER_VERSION = navigator.appVersion || "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
  var BROWSER_NAME = navigator.appCodeName || "Mozilla";
  var VERSION_CODE = 180800;
  var defaultIMFetchParams = {
    aid: 6383,
    app_name: "douyin_web",
    browser_language: "zh-CN",
    browser_name: BROWSER_NAME,
    browser_online: true,
    browser_platform: "Win32",
    browser_version: BROWSER_VERSION,
    cookie_enabled: true,
    cursor: "",
    device_id: "",
    device_platform: "web",
    did_rule: 3,
    endpoint: "live_pc",
    fetch_rule: 1,
    identity: "audience",
    insert_task_id: "",
    internal_ext: "",
    last_rtt: 0,
    live_id: 1,
    live_reason: "",
    need_persist_msg_count: 15,
    resp_content_type: "protobuf",
    screen_height: 1080,
    screen_width: 1920,
    support_wrds: 1,
    tz_name: "Asia/Shanghai",
    version_code: VERSION_CODE
  };
  var fetchImInfo = async function(roomId, uniqueId) {
    try {
      const msToken = getMsToken(184);
      const params = Object.assign({}, defaultIMFetchParams, {
        msToken,
        room_id: roomId,
        user_unique_id: uniqueId
      });
      const paramStr = makeUrlParams(
        Object.assign({}, defaultIMFetchParams, {
          room_id: roomId,
          user_unique_id: uniqueId,
          live_pc: roomId
        })
      );
      const aBogus = getAbogus(paramStr, USER_AGENT);
      Object.assign(params, {
        live_pc: roomId,
        a_bogus: aBogus
      });
      const url = `/webcast/im/fetch/?${makeUrlParams(params)}`;
      const buffer = await fetch(url).then((res) => res.arrayBuffer());
      return buffer;
    } catch (err) {
      return Promise.reject(Error("Fetch Im Info Error"));
    }
  };
  var getImInfo = async function(roomId, uniqueId) {
    const reqMs = Date.now();
    try {
      const buffer = await fetchImInfo(roomId, uniqueId);
      const res = decodeResponse(new Uint8Array(buffer));
      return {
        cursor: res.cursor,
        internalExt: res.internalExt,
        now: res.now,
        pushServer: res.pushServer,
        fetchInterval: res.fetchInterval,
        fetchType: res.fetchType,
        liveCursor: res.liveCursor
      };
    } catch (err) {
      const now = Date.now();
      return {
        cursor: `r-7497180536918546638_d-1_u-1_fh-7497179772733760010_t-${now}`,
        internalExt: `internal_src:dim|wss_push_room_id:${roomId}|wss_push_did:${uniqueId}|first_req_ms:${reqMs}|fetch_time:${now}|seq:1|wss_info:0-${now}-0-0|wrds_v:7497180515443673855`
      };
    }
  };

  // danmu-src/dycast.ts
  var CLog = { log() {
  }, info() {
  }, warn() {
  }, error() {
  }, debug() {
  } };
  var KNOWN_CAST_METHODS = /* @__PURE__ */ new Set([
    "WebcastChatMessage",
    "WebcastGiftMessage",
    "WebcastLikeMessage",
    "WebcastMemberMessage",
    "WebcastSocialMessage",
    "WebcastRoomUserSeqMessage",
    "WebcastControlMessage",
    "WebcastRoomRankMessage",
    "WebcastRoomStatsMessage",
    "WebcastEmojiChatMessage",
    "WebcastFansclubMessage",
    "WebcastRoomDataSyncMessage",
    "WebcastInRoomBannerMessage",
    "WebcastGroupLiveMemberChangeMessage"
  ]);
  function pbWalk(buf) {
    const out = [];
    let pos = 0;
    const varint = () => {
      let r = 0n, s = 0n;
      while (pos < buf.length) {
        const b = BigInt(buf[pos++]);
        r |= (b & 0x7fn) << s;
        if (!(b & 0x80n)) return r;
        s += 7n;
        if (s > 70n) throw new Error("varint-too-long");
      }
      throw new Error("eof");
    };
    while (pos < buf.length) {
      const tag = varint();
      const f = Number(tag >> 3n), w = Number(tag & 7n);
      if (f <= 0 || f > 1e5) throw new Error("bad-field");
      if (w === 0) out.push({ f, w, v: varint().toString() });
      else if (w === 2) {
        const len = Number(varint());
        if (len < 0 || pos + len > buf.length) throw new Error("bad-len");
        out.push({ f, w, v: buf.subarray(pos, pos + len) });
        pos += len;
      } else if (w === 5) {
        pos += 4;
        out.push({ f, w, v: null });
      } else if (w === 1) {
        pos += 8;
        out.push({ f, w, v: null });
      } else throw new Error("bad-wire");
    }
    return out;
  }
  var pbText = new TextDecoder();
  function pbSub(fields, f) {
    const hit = fields.find((x) => x.f === f && x.w === 2);
    return hit ? hit.v : null;
  }
  var BASE_URL = "wss://webcast5-ws-web-lf.douyin.com/webcast/im/push/v2/";
  var VERSION = "1.0.15";
  var defaultOpts = {
    aid: "6383",
    app_name: "douyin_web",
    browser_language: "zh-CN",
    browser_name: "Mozilla",
    browser_online: true,
    browser_platform: "Win32",
    browser_version: "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    compress: "gzip",
    cookie_enabled: true,
    device_platform: "web",
    did_rule: 3,
    endpoint: "live_pc",
    heartbeatDuration: "0",
    host: "https://live.douyin.com",
    identity: "audience",
    im_path: "/webcast/im/fetch/",
    insert_task_id: "",
    live_id: 1,
    live_reason: "",
    need_persist_msg_count: "15",
    screen_height: 1080,
    screen_width: 1920,
    support_wrds: 1,
    tz_name: "Asia/Shanghai",
    update_version_code: VERSION,
    version_code: "180800",
    webcast_sdk_version: VERSION
  };
  var DyCast = class {
    /** 房间号 */
    roomNum;
    /** 房间信息 */
    info;
    // 初次连接信息
    imInfo;
    /** WS客户端 */
    ws;
    /** 连接 url */
    url;
    // 连接状态
    state;
    /** 客户端状态 */
    wsRoomStatus;
    /** 直播间直播状态 */
    status;
    /** 连接配置 */
    options;
    // 心跳
    // 主要用于检查消息接收是否正常
    heartbeatDuration = 1e4;
    // 心跳次数
    pingCount = 0;
    // 心跳阈值
    // 如果 heartbeatDuration ms 内心跳次数大于等于该值，证明消息接收出错
    // 即 如果 10000 ms 内都没接收到新消息，证明消息接收出错
    downgradePingCount = 2;
    pingTimer = void 0;
    // 上次接收时间
    lastReceiveTime;
    cursor;
    /**
     * 自定义实现的 错误信息提示
     *  - 由于 dycast 的服务端并不会正确处理关闭帧
     *  - 调用 websocket close 后，关闭监听返回 1006
     */
    closeEvent;
    /** 当前重连次数 */
    reconnectCount;
    /** 最大重连尝试次数 */
    maxReconnectCount;
    // 是否需要重连
    shouldReconnect;
    // 正在重连中
    isReconnecting;
    // 订阅者
    emitter;
    constructor(roomNum) {
      this.roomNum = roomNum;
      this.state = false;
      this.heartbeatDuration = 1e4;
      this.pingCount = 0;
      this.downgradePingCount = 2;
      this.cursor = {
        cursor: "",
        firstCursor: "",
        internalExt: ""
      };
      this.reconnectCount = 0;
      this.maxReconnectCount = 3;
      this.lastReceiveTime = Date.now();
      this.wsRoomStatus = 1 /* UNCONNECTED */;
      this.shouldReconnect = false;
      this.closeEvent = { code: 1005, msg: "CLOSE_NO_STATUS" };
      this.info = {
        roomId: "",
        uniqueId: "",
        avatar: "",
        cover: "",
        nickname: "",
        title: "",
        status: 4
      };
      this.imInfo = {};
      this.status = 4 /* END */;
      this.emitter = new Emitter();
      this.isReconnecting = false;
    }
    /**
     * 监听
     * @param event
     * @param listener
     */
    on(event, listener) {
      this.emitter.on(event, listener);
    }
    /**
     * 取消监听
     * @param event
     * @param listener
     */
    off(event, listener) {
      this.emitter.off(event, listener);
    }
    /**
     * 一次性监听
     *  - 如监听打开关闭
     * @param event
     * @param listener
     */
    once(event, listener) {
      this.emitter.once(event, listener);
    }
    /**
     * 连接
     * @returns
     */
    async connect() {
      try {
        if (this.state) {
          this.emitter.emit("error", Error("\u5DF2\u8FDE\u63A5\uFF0C\u8BF7\u52FF\u91CD\u590D\u8FDE\u63A5"));
          return;
        }
        await this.fetchConnectInfo(this.roomNum);
        const params = this.getWssParam();
        if (this.isLiving()) {
          this.wsRoomStatus = 2 /* CONNECTING */;
          this._connect(params);
        } else {
          const liveStatus = this.getLiveStatus();
          this.wsRoomStatus = 5 /* CLOSED */;
          this.emitter.emit("close", 4001 /* LIVE_END */, liveStatus.msg);
        }
      } catch (err) {
        CLog.error("\u623F\u95F4\u8FDE\u63A5\u524D\u9519\u8BEF =>", err);
        this.emitter.emit("close", 4002 /* CONNECTING_ERROR */, "\u623F\u95F4\u8FDE\u63A5\u524D\u51FA\u9519");
        this._afterClose();
        this.emitter.emit("error", err);
      }
    }
    /**
     * 获取当前连接状态
     */
    getRoomStatus() {
      return this.wsRoomStatus;
    }
    /**
     * 实际连接逻辑
     * @param opts
     */
    _connect(opts) {
      this.options = opts;
      this.url = this._getSocketUrl(opts);
      this.cursor = {
        cursor: "",
        firstCursor: opts.cursor,
        internalExt: opts.internal_ext
      };
      this.lastReceiveTime = Date.now();
      this.pingCount = 0;
      try {
        this.ws = new WebSocket(this.url);
        this.ws.binaryType = "arraybuffer";
        this.ws.addEventListener("open", (ev) => {
          if (this.reconnectCount > 0) {
            this.reconnectCount = 0;
            this.emitter.emit("reconnect", ev);
          } else {
            this.emitter.emit("open", ev, this.info);
          }
          this.ping();
          this._afterOpen();
        });
        this.ws.addEventListener("close", (ev) => {
          this.handleClose(ev);
        });
        this.ws.addEventListener("error", (ev) => {
          this.emitter.emit("error", Error(ev.type || "Unknown Error"));
        });
        this.ws.addEventListener("message", (ev) => {
          this.handleMessage(ev.data);
        });
      } catch (err) {
        CLog.error("\u623F\u95F4\u8FDE\u63A5\u8FC7\u7A0B\u9519\u8BEF =>", err);
        this.emitter.emit("close", 4002 /* CONNECTING_ERROR */, "\u623F\u95F4\u8FDE\u63A5\u8FC7\u7A0B\u51FA\u9519");
        this._afterClose();
        this.emitter.emit("error", err);
      }
    }
    /** 处理关闭 */
    handleClose(ev) {
      let { code, reason } = ev;
      let msg = reason.toString();
      switch (code) {
        case 1005 /* NO_STATUS */:
        case 1006 /* ABNORMAL */:
          code = this.closeEvent.code || code;
          msg = this.closeEvent.msg || msg || "closed";
          break;
      }
      this._afterClose();
      if (this.shouldReconnect || this.reconnectCount > 0) {
        this.reconnect();
      } else {
        this.emitter.emit("close", code, msg);
      }
    }
    /**
     * 处理消息
     */
    async handleMessage(data) {
      this.pingCount = 0;
      this.lastReceiveTime = Date.now();
      let res;
      try {
        res = await this._decodeFrame(new Uint8Array(data));
      } catch (err) {
        res = null;
      }
      if (!res) return;
      const { response, frame, cursor, needAck, internalExt } = res;
      if (needAck) {
        const ack = this._ack(internalExt, frame?.logId);
        this.setCursor(cursor, internalExt);
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(ack);
        } else {
          CLog.error(`ACK\u53D1\u9001\u5F02\u5E38 => \u76F4\u64AD\u95F4[${this.roomNum}]\u5DF2\u5173\u95ED`);
          this._afterClose();
        }
      }
      if (frame) {
        if (frame.payloadType === "msg" /* Msg */) {
          this._dealMessages(response.messages);
        }
        if (frame.payloadType === "close" /* Close */) {
          this.close(1e3 /* NORMAL */, "Close By PayloadType");
        }
      }
    }
    /**
     * 重连
     */
    reconnect() {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.close(4004 /* RECONNECTING */, "\u56E0\u91CD\u8FDE\u800C\u5173\u95ED");
      }
      this.shouldReconnect = false;
      const opts = Object.assign({}, this.options, {
        cursor: this.cursor.cursor,
        internal_ext: this.cursor.internalExt
      });
      this.reconnectCount++;
      if (this.reconnectCount > this.maxReconnectCount) {
        CLog.error("\u5DF2\u8D85\u8FC7\u6700\u5927\u91CD\u8FDE\u6B21\u6570\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
        this.emitter.emit("error", Error("\u5DF2\u8D85\u8FC7\u6700\u5927\u91CD\u8FDE\u6B21\u6570\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5"));
        return;
      }
      this.wsRoomStatus = 4 /* RECONNECTING */;
      this.emitter.emit("reconnecting", this.reconnectCount);
      this.isReconnecting = true;
      this._connect(opts);
    }
    /**
     * 关闭
     */
    close(code = 1005, reason = "close") {
      if (this.ws) {
        this.state = false;
        this.closeEvent = { code, msg: reason };
        this.ws.close();
        this.ws = void 0;
      }
    }
    /**
     * 发送心跳帧
     */
    ping() {
      try {
        let dur = Math.max(1e4, Number(this.heartbeatDuration));
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(this._ping());
          this.pingCount++;
          if (this.pingCount >= this.downgradePingCount) {
            return this.cannotReceiveMessage();
          }
        }
        this.pingTimer = setTimeout(() => {
          this.state && this.ping();
        }, dur);
      } catch (err) {
        CLog.error("DyCast Ping Error =>", err);
      }
    }
    /**
     * 无法正常接收消息
     *  - 长时间未接收到消息
     */
    cannotReceiveMessage() {
      this.close(4003 /* CANNOT_RECEIVE */, "\u5BA2\u6237\u7AEF\u65E0\u6CD5\u6B63\u5E38\u63A5\u6536\u4FE1\u606F");
      let tmp = Date.now() - this.lastReceiveTime;
      CLog.error(`DyCast Cannot Receive Message => after ${tmp} ms`);
      this.emitter.emit("reconnecting", this.reconnectCount, 4003 /* CANNOT_RECEIVE */, "\u5BA2\u6237\u7AEF\u65E0\u6CD5\u6B63\u5E38\u63A5\u6536\u4FE1\u606F");
      this.reconnectCount < this.maxReconnectCount && (this.shouldReconnect = true);
    }
    /**
     * 设置 cursor
     * @param cur
     * @param ext
     */
    setCursor(cur, ext) {
      this.cursor.cursor = cur;
      this.cursor.internalExt = ext;
      if (!this.cursor.firstCursor) {
        this.cursor.firstCursor = cur;
      }
    }
    /**
     * 处理一次接收的消息集
     */
    async _dealMessages(msgs) {
      if (!msgs || msgs.length < 1) return;
      const messages = [];
      try {
        for (const msg of msgs) {
          const message = await this._dealMessage(msg);
          if (message) messages.push(message);
        }
      } catch (err) {
      }
      if (!messages.length) return;
      this.emitter.emit("message", messages);
    }
    /**
     * 处理一条消息
     * @param msg
     */
    async _dealMessage(msg) {
      const method = msg.method;
      const data = {};
      data.id = msg.msgId;
      let message = null;
      let payload = msg.payload;
      if (!payload) return null;
      try {
        const w = typeof window !== "undefined" ? window : null;
        if (w) {
          const key = method || "unknown";
          (w.__mc = w.__mc || {})[key] = (w.__mc[key] || 0) + 1;
          if (method && !KNOWN_CAST_METHODS.has(method)) {
            w.__mraw = w.__mraw || {};
            if (payload.length < 6e4 && Object.keys(w.__mraw).length < 80) {
              let bin = "";
              for (let i = 0; i < payload.length; i += 8192) {
                bin += String.fromCharCode.apply(null, payload.subarray(i, i + 8192));
              }
              w.__mraw[method] = btoa(bin);
            }
          }
        }
      } catch (e) {
      }
      try {
        switch (method) {
          case "WebcastChatMessage" /* CHAT */:
            message = decodeChatMessage(payload);
            data.method = "WebcastChatMessage" /* CHAT */;
            data.user = this._getCastUser(message.user);
            data.content = message.content;
            data.rtfContent = this._getCastRtfContent(message.rtfContentV2);
            break;
          case "WebcastGiftMessage" /* GIFT */:
            message = decodeGiftMessage(payload);
            data.method = "WebcastGiftMessage" /* GIFT */;
            data.user = this._getCastUser(message.user);
            data.toUser = this._getCastUser(message.toUser);
            data.gift = this._getCastGift(message.gift, message.repeatCount || message.comboCount, message.repeatEnd);
            break;
          case "WebcastLikeMessage" /* LIKE */:
            message = decodeLikeMessage(payload);
            data.method = "WebcastLikeMessage" /* LIKE */;
            data.user = this._getCastUser(message.user);
            data.content = `\u4E3A\u4E3B\u64AD\u70B9\u8D5E\u4E86(${message.count})`;
            data.room = { likeCount: message.total };
            break;
          case "WebcastMemberMessage" /* MEMBER */:
            message = decodeMemberMessage(payload);
            data.method = "WebcastMemberMessage" /* MEMBER */;
            data.user = this._getCastUser(message.user);
            data.content = "\u8FDB\u5165\u76F4\u64AD\u95F4";
            data.room = { audienceCount: message.memberCount };
            break;
          case "WebcastSocialMessage" /* SOCIAL */:
            message = decodeSocialMessage(payload);
            data.method = "WebcastSocialMessage" /* SOCIAL */;
            data.user = this._getCastUser(message.user);
            data.content = "\u5173\u6CE8\u4E86\u4E3B\u64AD";
            data.room = { followCount: message.followCount };
            break;
          case "WebcastEmojiChatMessage" /* EMOJI_CHAT */:
            message = decodeEmojiChatMessage(payload);
            data.method = "WebcastEmojiChatMessage" /* EMOJI_CHAT */;
            data.user = this._getCastUser(message.user);
            data.content = this._getCastEmoji(message.emojiContent);
            break;
          case "WebcastRoomUserSeqMessage" /* ROOM_USER_SEQ */:
            message = decodeRoomUserSeqMessage(payload);
            data.method = "WebcastRoomUserSeqMessage" /* ROOM_USER_SEQ */;
            data.rank = this._getCastRanksA(message.ranks);
            data.room = { audienceCount: message.total, totalUserCount: message.totalUser };
            break;
          case "WebcastControlMessage" /* CONTROL */:
            message = decodeControlMessage(payload);
            data.method = "WebcastControlMessage" /* CONTROL */;
            data.content = message.common?.describe;
            data.room = { status: parseInt(message.action || "") || void 0 };
            break;
          case "WebcastRoomRankMessage" /* ROOM_RANK */:
            message = decodeRoomRankMessage(payload);
            data.method = "WebcastRoomRankMessage" /* ROOM_RANK */;
            data.rank = this._getCastRanksB(message.ranks);
            break;
          case "WebcastRoomStatsMessage" /* ROOM_STATS */:
            message = decodeRoomStatsMessage(payload);
            data.method = "WebcastRoomStatsMessage" /* ROOM_STATS */;
            data.room = { audienceCount: message.displayMiddle };
            break;
          case "WebcastGroupLiveMemberChangeMessage" /* GROUP_MEMBER_CHANGE */: {
            const members = [];
            for (const entry of pbWalk(payload).filter((x) => x.f === 2 && x.w === 2)) {
              try {
                const sub = pbWalk(entry.v);
                let name = "";
                const userBuf = pbSub(sub, 1);
                if (userBuf) {
                  const nameBuf = pbSub(pbWalk(userBuf), 3);
                  if (nameBuf) name = pbText.decode(nameBuf);
                }
                const scoreField = sub.find((x) => x.f === 2 && x.w === 0);
                let status = "";
                const stBuf = pbSub(sub, 4);
                if (stBuf) {
                  const stTextBuf = pbSub(pbWalk(stBuf), 1);
                  if (stTextBuf) status = pbText.decode(stTextBuf);
                }
                if (name) members.push({ name, score: scoreField ? String(scoreField.v) : "", status });
              } catch (e) {
              }
            }
            if (!members.length) return null;
            data.method = "WebcastGroupLiveMemberChangeMessage" /* GROUP_MEMBER_CHANGE */;
            data.members = members;
            break;
          }
        }
        if (!data.method) return null;
      } catch (err) {
        return null;
      }
      return data;
    }
    /**
     * 获取当前的送礼榜单
     * @param data
     */
    _getCastRanksA(data) {
      if (!data || !data.length) return void 0;
      const list = [];
      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        list.push({
          avatar: item.user?.avatarThumb?.urlList?.[0] || "",
          nickname: item.user?.nickname || "",
          rank: item.rank || i + 1
        });
      }
      return list;
    }
    /**
     * 获取当前的送礼榜单
     * @param data
     */
    _getCastRanksB(data) {
      if (!data || !data.length) return void 0;
      const list = [];
      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        list.push({
          avatar: item.user?.avatarThumb?.urlList?.[0] || "",
          nickname: item.user?.nickname || "",
          rank: item.scoreStr || i + 1
        });
      }
      return list;
    }
    /**
     * 获取弹幕用户
     * @param data
     * @returns
     */
    _getCastUser(data) {
      if (!data) return void 0;
      return {
        id: data.secUid,
        name: data.nickname,
        gender: data.gender,
        avatar: data.avatarThumb?.urlList?.[0]
      };
    }
    /**
     * 获取弹幕礼物
     * @param data
     * @returns
     */
    _getCastGift(data, count, end) {
      if (!data) return void 0;
      return {
        id: data.id,
        name: data.name,
        price: data.diamondCount,
        type: data.type,
        desc: data.describe,
        icon: data.image?.urlList?.[0],
        count,
        repeatEnd: end
      };
    }
    /**
     * 获取会员表情
     * @param data
     * @returns
     */
    _getCastEmoji(data) {
      if (!data) return void 0;
      return data.pieces?.[0]?.imageValue?.image?.urlList?.[0];
    }
    /**
     * 获取弹幕富文本内容
     * @param data
     * @returns
     */
    _getCastRtfContent(data) {
      if (!data) return void 0;
      if (!data.pieces) return void 0;
      const pieces = data.pieces;
      const list = [];
      for (let i = 0; i < pieces.length; i++) {
        if (pieces[i].imageValue) {
          let url = pieces[i].imageValue?.image?.urlList?.[0];
          let name = pieces[i].imageValue?.image?.content?.name;
          list.push({
            type: 2 /* EMOJI */,
            text: name,
            url
          });
        } else if (pieces[i].userValue) {
          let atUser = pieces[i].userValue?.user;
          list.push({
            type: 3 /* USER */,
            text: `@${atUser?.nickname}`,
            user: this._getCastUser(atUser)
          });
        } else {
          list.push({
            type: 1 /* TEXT */,
            text: pieces[i].stringValue || ""
          });
        }
      }
      return list;
    }
    /**
     * 处理接收的二进制消息
     * @param data
     */
    async _decodeFrame(data) {
      const frame = decodePushFrame(data);
      let payload = frame.payload;
      const headers = frame.headersList;
      let cursor = "";
      let internalExt = "";
      let needAck = false;
      if (!payload) return null;
      if (headers) {
        if (headers["compress_type"] && headers["compress_type"] === "gzip") {
          payload = inflate(payload);
        }
        if (headers["im-cursor"]) {
          cursor = headers["im-cursor"];
        }
        if (headers["im-internal_ext"]) {
          internalExt = headers["im-internal_ext"];
        }
      }
      const res = decodeResponse(payload);
      if (!cursor && res.cursor) cursor = res.cursor;
      if (!internalExt && res.internalExt) internalExt = res.internalExt;
      if (res.needAck) needAck = res.needAck;
      return {
        response: res,
        frame,
        cursor,
        needAck,
        internalExt
      };
    }
    /** 心跳数据 */
    _ping() {
      return encodePushFrame({
        payloadType: "hb" /* Hb */
      });
    }
    /**
     * Ack 数据
     * @param ext Frame im-internal_ext | Response internalExt
     * @param logId
     */
    _ack(ext = "", logId) {
      const getPayload = function(_ext) {
        let arr = [];
        for (let s of _ext) {
          let index = s.charCodeAt(0);
          index < 128 ? arr.push(index) : index < 2048 ? (arr.push(192 + (index >> 6)), arr.push(128 + (63 & index))) : index < 65536 && (arr.push(224 + (index >> 12)), arr.push(128 + (index >> 6 & 63)), arr.push(128 + (63 & index)));
        }
        return new Uint8Array(arr);
      };
      return encodePushFrame({
        payloadType: "ack" /* Ack */,
        payload: getPayload(ext),
        logId
      });
    }
    /** 关闭后 */
    _afterClose() {
      this.state = false;
      if (this.pingTimer) {
        clearTimeout(this.pingTimer);
        this.pingTimer = void 0;
      }
      this.cursor = {
        cursor: "",
        firstCursor: "",
        internalExt: ""
      };
      this.wsRoomStatus = 5 /* CLOSED */;
      this.closeEvent = { code: 1005 /* NO_STATUS */, msg: "CLOSE_NO_STATUS" };
      this.ws = void 0;
      this.isReconnecting = false;
    }
    /** 打开后 */
    _afterOpen() {
      this.state = true;
      this.wsRoomStatus = 3 /* CONNECTED */;
      this.isReconnecting = false;
      this.reconnectCount = 0;
    }
    /**
     * 获取完整的 wss 地址
     * @param opts
     * @returns
     */
    _getSocketUrl(opts) {
      const fullOpt = Object.assign({}, defaultOpts, opts);
      return `${BASE_URL}?${this._mergeOptions(fullOpt)}`;
    }
    /**
     * 将配置转换为 url 参数字符串
     *  - 如：item1=value1&item2=value2&...
     * @param opts
     * @returns
     */
    _mergeOptions(opts) {
      return Object.keys(opts).reduce((t, n) => {
        let r;
        return `${t}${t ? "&" : ""}${n}=${null != (r = opts[n]) ? r : ""}`;
      }, "");
    }
    /**
     * 获取连接信息
     * @param roomNum
     * @returns
     */
    async fetchConnectInfo(roomNum) {
      try {
        const info = await getLiveInfo(roomNum);
        this.info = info;
        this.status = info.status;
        await fetchUser();
        const res = await getImInfo(info.roomId, info.uniqueId);
        this.imInfo = res;
      } catch (err) {
        return Promise.reject(err);
      }
    }
    /**
     * 整理连接参数对象
     */
    getWssParam() {
      const { roomId, uniqueId } = this.info;
      const sign = getSignature(roomId, uniqueId);
      return {
        room_id: roomId,
        user_unique_id: uniqueId,
        cursor: this.imInfo.cursor || "",
        internal_ext: this.imInfo.internalExt || "",
        signature: sign
      };
    }
    /**
     * 是否已经直播
     */
    isLiving() {
      return this.status === 2 /* LIVING */;
    }
    /** 获取直播状态 */
    getLiveStatus() {
      let type = "Unknown";
      let code = 0;
      let msg = "\u672A\u77E5\u72B6\u6001";
      switch (this.status) {
        case 1 /* PREPARE */:
          type = "PREPARE";
          code = 1 /* PREPARE */;
          msg = "\u4E3B\u64AD\u6B63\u5728\u51C6\u5907\u4E2D";
          break;
        case 2 /* LIVING */:
          type = "LIVING";
          code = 2 /* LIVING */;
          msg = "\u4E3B\u64AD\u6B63\u5728\u76F4\u64AD\u4E2D";
          break;
        case 3 /* PAUSE */:
          type = "PAUSE";
          code = 3 /* PAUSE */;
          msg = "\u4E3B\u64AD\u6682\u65F6\u79BB\u5F00\u4E86";
          break;
        case 4 /* END */:
          type = "END";
          code = 4 /* END */;
          msg = "\u4E3B\u64AD\u5DF2\u4E0B\u64AD";
          break;
      }
      return {
        type,
        code,
        msg
      };
    }
    /**
     * 获取直播间信息
     */
    getLiveInfo() {
      return {
        ...this.info,
        roomNum: this.roomNum
      };
    }
  };

  // danmu-src/entry.js
  var conns = /* @__PURE__ */ new Map();
  function nick(u) {
    return u && (u.name || u.nickname) || "";
  }
  function simplify(items) {
    const out = [];
    for (const m of items || []) {
      const method = m.method;
      if (method === "WebcastChatMessage" || method === "WebcastEmojiChatMessage") {
        out.push({ type: "chat", user: nick(m.user), content: m.content || "" });
      } else if (method === "WebcastGiftMessage") {
        const g = m.gift || {};
        const cnt = Number(g.count) || 1;
        out.push({ type: "gift", user: nick(m.user), giftName: g.name || "\u793C\u7269", giftCount: cnt });
      } else if (method === "WebcastMemberMessage") {
        out.push({ type: "join", user: nick(m.user), content: "\u6765\u4E86" });
      } else if (method === "WebcastSocialMessage") {
        out.push({ type: "social", user: nick(m.user), content: "\u5173\u6CE8\u4E86\u4E3B\u64AD" });
      } else if (method === "WebcastLikeMessage") {
        out.push({ type: "like", user: nick(m.user), content: m.content || "\u70B9\u8D5E\u4E86" });
      } else if (method === "WebcastRoomUserSeqMessage") {
        const c = m.room && m.room.audienceCount;
        if (c != null) out.push({ type: "online", online: String(c) });
      } else if (method === "WebcastRoomRankMessage") {
        if (m.rank && m.rank.length) {
          out.push({ type: "rank", list: m.rank.slice(0, 20).map((r) => ({ nickname: r.nickname || "", rank: r.rank })) });
        }
      } else if (method === "WebcastRoomStatsMessage") {
        const c = m.room && m.room.audienceCount;
        if (c != null) out.push({ type: "online", online: String(c) });
      } else if (method === "WebcastGroupLiveMemberChangeMessage") {
        if (m.members && m.members.length) out.push({ type: "members", list: m.members.slice(0, 10) });
      }
    }
    return out;
  }
  window.__dyConnect = function(id, roomNum) {
    if (conns.has(id)) return;
    let cast;
    try {
      cast = new DyCast(String(roomNum));
    } catch (e) {
      return;
    }
    conns.set(id, cast);
    cast.on("message", (items) => {
      try {
        const s = simplify(items);
        if (s.length && window.__dyEmit) window.__dyEmit(id, s);
      } catch (e) {
      }
    });
    cast.on("open", () => {
      if (window.__dyStatus) window.__dyStatus(id, "open");
    });
    cast.on("close", (code, reason) => {
      if (window.__dyStatus) window.__dyStatus(id, "close", String(reason || ""));
    });
    cast.on("error", (e) => {
      if (window.__dyStatus) window.__dyStatus(id, "error", String(e && e.message || e));
    });
    try {
      cast.connect();
    } catch (e) {
    }
  };
  window.__dyDisconnect = function(id) {
    const c = conns.get(id);
    if (c) {
      try {
        c.close();
      } catch (e) {
      }
      conns.delete(id);
    }
  };
  window.__dyReady = true;
})();
