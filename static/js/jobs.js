// Copyright 2012 Google Inc. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

define(['jquery', 'api', 'util', 'input', 'cterm', 'hterm'],
function($, api, util, input, cterm){
  'use strict';

  var LINES_IN_TINY = 3;
  var LINES_IN_PAGE = 24;

  var SCROLL_PAGE = {};
  var SCROLL_FULL = {};

  var scrollback = $('#scrollback');
  var jobProto = scrollback.children('.job.proto').detach();
  jobProto.removeClass('proto');

  function countOccurances(s, c) {
    var l=c.length;
    var n=-1;
    var p=0;
    do { p=s.indexOf(c,p)+l; n++; } while (p>0);
    return n;
  }

  function jobFromElement(elem) {
    return $(elem).closest('.job').data('jobPrivate');
  }

  var currentTopic = null;

  function focusTopic(nextTopic) {
    if (currentTopic) currentTopic.removeClass('topic')
    currentTopic = nextTopic;
    if (currentTopic) {
      currentTopic.addClass('topic');
      util.scrollIntoView(scrollback, currentTopic);
      currentTopic.find('[tabindex]').focus();
    }
  }

  function nextTopic(n) {
    var next = currentTopic;
    if (!currentTopic) {
      next = scrollback.children('.job').last();
    } else if (!(currentTopic.hasClass('focus'))) {
      // ignore motion if topic wasn't focused, and just refocus
    } else {
      switch (n) {
        case -1:
          next = currentTopic.next('.job');
          break;
        case 1:
          next = currentTopic.prev('.job');
          break;
      }
    }
    if (next && next.length) {
      focusTopic(next);
    }
  }

  function atLastTopic() {
    return currentTopic && currentTopic.next('.job').length === 0;
  }
  function topicCommand() {
    return currentTopic ? currentTopic.data('jobPrivate').cmd : '';
  }




  scrollback.on('scroll', '.output-container', function() {
    // TODO(jasvir): Do the same for scrollBottom
    if ($(this).scrollTop() === 0) {
      $(this).css('-webkit-mask-image', 'none');
    } else {
      $(this).css('-webkit-mask-image',
        '-webkit-gradient(linear, left top, 0 10,'
        + ' from(rgba(0,0,0,0)), to(rgba(0,0,0,1)))');
    }
  });

  scrollback.on('click', '.send-eof',
    function(e) { jobFromElement(this).sender('\x04'); });
  scrollback.on('click', '.send-sigint',
    function(e) { jobFromElement(this).signaler('int'); });
  scrollback.on('click', '.send-sigquit',
    function(e) { jobFromElement(this).signaler('quit'); });
  scrollback.on('click', '.send-sigkill',
    function(e) { jobFromElement(this).signaler('kill'); });

  scrollback.on('click', '.view-hide',
    function(e) { jobFromElement(this).sizeOutput('hide'); });
  scrollback.on('click', '.view-tiny',
    function(e) { jobFromElement(this).sizeOutput('tiny'); });
  scrollback.on('click', '.view-page',
    function(e) { jobFromElement(this).sizeOutput('page'); });
  scrollback.on('click', '.view-full',
    function(e) { jobFromElement(this).sizeOutput('full'); });
  scrollback.on('click', '.view-deferred',
    function(e) { jobFromElement(this).loadDeferredOutput(); });

  scrollback.on('click', '.job',
    function(e) { jobFromElement(this).takeTopic(); });

  scrollback.on('focusin', '.job',
    function(e) { $(this).addClass('focus'); });
  scrollback.on('focusout', '.job',
    function(e) { $(this).removeClass('focus'); });

  // keydown handler for jobs, even when running
  var jobKeydown = input.keyHandler({
    functions: {
      pageDown:           function(j) { j.scroller(1, SCROLL_PAGE); },
      pageUp:             function(j) { j.scroller(-1, SCROLL_PAGE); },
    },
    bindings: {
      'PAGE_DOWN,   ALT+PAGE_DOWN':   'pageDown',
      'PAGE_UP,     ALT+PAGE_UP':     'pageUp',
      '             ALT+SPACE':       'pageDown',
      '             ALT+SHIFT+SPACE': 'pageUp',

      'END,  ALT+END':    function(j) { j.scroller(1, SCROLL_FULL); },
      'HOME, ALT+HOME':   function(j) { j.scroller(-1, SCROLL_FULL); },

      'ALT+0':            function(j) { j.sizeOutput('hide'); },
      'ALT+1':            function(j) { j.sizeOutput('tiny'); },
      'ALT+2':            function(j) { j.sizeOutput('page'); },
      'ALT+3':            function(j) { j.sizeOutput('full'); },
    }
  });

  function keydown(e) {
    if (!currentTopic) return;
    var j = currentTopic.data('jobPrivate');
    return jobKeydown(e, j);
  }

  var forwardingKeys = input.keyHandler({
    functions: {
      forward: function() { }
    },
    bindings: {
      'ALT+SPACE,   ALT+SHIFT+SPACE':           'forward',
      '    PAGE_UP,     PAGE_DOWN':             'forward',
      'ALT+PAGE_UP, ALT+PAGE_DOWN':             'forward',
      '    HOME,        END':                   'forward',
      'ALT+HOME,    ALT+END':                   'forward',
      'ALT+0, ALT+1, ALT+2, ALT+3':             'forward',
      'ALT+UP, ALT+DOWN, ALT+LEFT, ALT+RIGHT':  'forward',
      'ALT+RETURN':                             'forward',
    }
  });

  function forwardingKeydown(e) {
    var r = forwardingKeys(e);
    if (r !== undefined) {
      $(window).triggerHandler(e);
      e.stopImmediatePropagation();
      e.originalEvent.stopImmediatePropagation();
        // needed due to bug in jQuery: stop DOM added handlers, too
      e.preventDefault();
      return r;
    }
  }

  var jobCount = 0;

  function newJob(cmd, job, historical) {
    if (!job) {
      job = "job" + (++jobCount);
    }

    var node = jobProto.clone();
    node.attr('data-job', job);
    node.find('.command').text(cmd);
    if (historical) {
      node.prependTo(scrollback);
    } else {
      node.appendTo(scrollback);
      util.scrollIntoView(scrollback, node);
    }

    var output = node.find('.output-container');
    var outputArea = output.find('.output');
    var deferredOutputLoader = null;
    var terminal = null;
    var terminalNode = null;
    var terminalIsFullScreen = false;

    function sender(s) {
      api.api('input', {job: job, input: s}, function() {});
    };

    function signaler(s) {
      s = 'kill'; // TODO: remove this when int and quit work
      api.api('input', {job: job, signal: s}, function() {});
    };

    function sizeOutput(m) {
      if (deferredOutputLoader) {
        loadDeferredOutput();
      } else {
        output.removeClass('output-hide output-tiny output-page output-full');
        output.addClass('output-' + m);
        setTimeout(function() { util.scrollIntoView(scrollback, node); }, 100);
          // have to wait until layout has been recomputed for new size
      }
    };

    function setDeferredOutput(f) {
      deferredOutputLoader = f;
      node.addClass('max-deferred');
      output.removeClass('output-hide output-tiny output-page output-full');
      output.addClass('output-hide');
    }

    function loadDeferredOutput() {
      if (deferredOutputLoader) {
        deferredOutputLoader(job);
        deferredOutputLoader = null;
        node.removeClass('max-deferred');
        adjustOutput();
      }
    }

    function scroller(dir, amt) {
      var line = 10; // TODO: Should be determined dynamically

      var scroll = 0;
      if      (amt === SCROLL_FULL)  scroll = outputArea.height();
      else if (amt === SCROLL_PAGE)  scroll = output.height() - 2 * line;

      output.scrollTop(output.scrollTop() + scroll * dir);
    }

    function takeTopic() {
      focusTopic(node);
    }

    var jobPrivate = {
      cmd: cmd,
      sender: sender,
      signaler: signaler,
      sizeOutput: sizeOutput,
      loadDeferredOutput: loadDeferredOutput,
      scroller: scroller,
      takeTopic: takeTopic
    };
    node.data('jobPrivate', jobPrivate);

    var input = node.find('.input-container');
    if (historical) {
      input.remove();
      input = null;
    } else {
      outputArea.on('keydown', forwardingKeydown);
      takeTopic();
    }

    var lineHeight = null;


    function adjustOutput() {
      var m, s;

      if (terminalIsFullScreen) {
        m =  s = 'full';
      } else if (terminal) {
        var n1 = terminal.getLineCount();
        if (lineHeight === null) {
          lineHeight = Math.max(1,
              outputArea.css('lineHeight').replace(/px$/,''));
        }
        var n2 = Math.floor(outputArea.height() / lineHeight);
        var n = Math.max(n1, n2);

        if (n == 0 && input) n = 1;

        if (n == 0)                   m = s = 'hide';
        else if (n <= LINES_IN_TINY)  m = s = 'tiny';
        else if (n <= LINES_IN_PAGE)  m = s = 'page';
        else                          { m = 'full'; s = 'page'; }
      } else {
        m = s = 'hide';
      }

      if (!deferredOutputLoader) {
        node.removeClass('max-hide max-tiny max-page max-full');
        node.addClass('max-' + m);
        sizeOutput(s);
      }
    };

    function removeInput() {
      if (input) {
        input.remove();
        input = null;
        adjustOutput();
      }
    };

    function setClass(cls) {
      node.removeClass('running complete').addClass(cls);
    };

    function addVTOutput(txt) {
      removeInput();
      var where = output.find('.output');
      if (where.length != 1) { return; }
      where.addClass('vtoutput');
      var node = $('<div></div>', { 'class': 'terminal' })
      node.appendTo(where);
      var term = new hterm.Terminal();
      term.decorate(node.get(0));
      term.io.onVTKeystroke = sender;
      term.io.sendString = sender;
      term.onTerminalReady = function() {
        var style = getComputedStyle(where.get(0));
        term.setFontSize(style.fontSize.replace(/px$/,''));
        term.setBackgroundColor(style.backgroundColor);
        term.setForegroundColor(style.color);
        term.setWidth(80);
        term.setHeight(24);
        term.setAutoCarriageReturn(true);
        term.interpret(txt);
        term.installKeyboard();
        terminal = term;
        terminalNode = node;
        terminalIsFullScreen = true;
        adjustOutput();
        node.get(0).scrollIntoView(true);
      }
    };

    function removeOutput() {
      if (terminal) {
        terminal.uninstallKeyboard();
        if (terminalIsFullScreen) {
          terminal.setCursorVisible(false);
        }
        terminal = null;
      }
      fullScreenReplayBuffer = null;
    };

    var pleaseGoFullScreen = false;
    var fullScreenReplayBuffer = '';
    var FULL_SCREEN_REPLAY_MAX_LENGTH = 4096;
    var SCROLL_END_TOLERANCE = 6;

    function addOutput(cls, txt) {
      if (terminal === null) {
        terminal = new cterm.Terminal(outputArea, goFullScreen);
        terminal.io.onVTKeystroke = sender;
        terminal.io.sendString = sender;
        terminal.installKeyboard();
      }
      if (terminalIsFullScreen) {
        terminal.interpret(txt);
        return;
      }

      if (fullScreenReplayBuffer !== null) {
        if (fullScreenReplayBuffer.length + txt.length
            < FULL_SCREEN_REPLAY_MAX_LENGTH) {
          fullScreenReplayBuffer += txt;
        } else {
          fullScreenReplayBuffer = null;
        }
      }

      var oldEnd = outputArea.outerHeight();
      var wasAtEnd = (
            output.scrollTop() + output.height() + SCROLL_END_TOLERANCE
            >= oldEnd);

      terminal.setSpanClass(cls);
      terminal.interpret(txt);

      if (wasAtEnd) {
        util.scrollIntoView(output, outputArea, oldEnd);
      }

      if (pleaseGoFullScreen) {
        pleaseGoFullScreen = false;
        outputArea.empty();
        addVTOutput(fullScreenReplayBuffer || '');
        fullScreenReplayBuffer = '';
      } else {
        adjustOutput();
      }
    }

    function goFullScreen() { pleaseGoFullScreen = true; }

    function setRunning() {
      setClass('running');
    }

    function setComplete(exitcode) {
      setClass(exitcode === 0 ? 'complete' : 'failed');
      removeInput();
      removeOutput();
    }

    var jobPublic = {
      job: job,
      user: true,
      addOutput: addOutput,
      setRunning: setRunning,
      setComplete: setComplete,
      setDeferredOutput: setDeferredOutput
    };

    node.data('jobPublic', jobPublic);
    return jobPublic;
  }

  var unknownJob = {
    user: false,
    addOutput: function(cls, txt) {
      var node = $('<span></span>', { 'class': cls }).text(txt);
      node.appendTo(scrollback);
      node[0].scrollIntoView(true);
    },
    setRunning: function() { },
    setComplete: function(e) { },
    setDeferredOutput: function(f) { }
  };

  function fromJob(job) {
    return $('.job[data-job="' + job + '"]').data('jobPublic') || unknownJob;
  }

  function toDiv(j) {
    return $('.job[data-job="' + j.job + '"]');
  }


  return {
    newJob:           function(cmd, job) { return newJob(cmd, job, false); },
    addHistoricalJob: function(cmd, job) { return newJob(cmd, job, true); },
    fromJob: fromJob,
    unknownJob: unknownJob,

    nextTopic: nextTopic,
    atLastTopic: atLastTopic,
    topicCommand: topicCommand,
    keydown: keydown
  };
});
