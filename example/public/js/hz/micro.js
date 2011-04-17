(function(){
  var cache = {};
  $.fn.microtemplate = function(data){
    var fn = null;
var str = this[0].innerHTML;
var key = this[0].id;
if(cache[key])
fn = cache[key];
else
{
var code = "var p = []; var cache_p = []; var _records = []; var START_RECORD = function() { cache_p = $.extend([], p); p = []; }; var END_RECORD = function(item, fn) { _records.push({ html: p.join(''), fn: fn, item:item }); p = cache_p; p.push('<span id=\"_records_' + (_records.length-1) + '\" style=\"display:none\"></span>'); }; var print = function() { p.push.apply(p, arguments); };p.push('";
code += str.replace(/[\r\t\n]/g, " ")
   .replace(/'(?=[^%]*%>)/g,"\t")
   .split("'").join("\\'")
   .split("\t").join("'")
   .replace(/<%=(.+?)%>/g, "',$1,'")
   .split("<%").join("');")
   .split("%>").join("p.push('");
code +="');if (_records.length) { var _return = $(p.join('')); for (var i = 0; i < _records.length; i++) { var rec = _records[i]; var context = $(rec.html); rec.fn(rec.item, context); _return.find('#_records_'+i).replaceWith(context); } return _return; } else return p.join('');";
fn = cache[key] = new Function("$data", code);
}
return data ? fn( data ) : fn;
  };
  $.microtemplate = function(data, str, key)
  {
return $('<script id="'+key+'" type="text/x-microtemplate">'+str+'</script>').microtemplate(data);
  }
})();