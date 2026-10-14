mergeInto(LibraryManager.library, {
  // Unity calls this; the React host listens with
  // window.addEventListener("kyro", e => { e.detail.event, e.detail.payload })
  KyroEmit: function (eventNamePtr, payloadPtr) {
    var eventName = UTF8ToString(eventNamePtr);
    var payload = UTF8ToString(payloadPtr);
    var detail = { event: eventName, payload: null };

    try {
      detail.payload = JSON.parse(payload);
    } catch (e) {
      detail.payload = payload;
    }

    window.dispatchEvent(new CustomEvent("kyro", { detail: detail }));
  },
});
