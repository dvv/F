var _ = require('underscore');

var x = {
	a: 'b',
	f: function(){},
	Foo: {
		deep1: function(){},
		Bar: {
			deep2: function(){},
			Baz: {
				deep3: function(){}
			}
		}
	},
	Baz: {
		foo: '123'
	}
};

x = {
	f0: function(){},
	Foo: {
		f1: function(){},
		Bar: {
			f2: function(){console.log('f2', arguments);},
			Baz: {
				f3: function(){}
			}
		},
		f4: function(){}
	}
};

function str0(x) {
	var s = JSON.stringify(x);
	return s;
}

function str1(x) {
	var s = JSON.stringify(x, function(k, v) {
		//console.log('REPL', this, k);
		if (typeof v === 'function') {
			v = '~-=(){}=-~';
		}
		return v;
	});
	return s;
}

function str2(x) {

	var p = [];
	var o = [];

	function replacer(k, v) {
		var i = o.indexOf(this);
		if (k) {
			if (i < 0) {
				//console.log('PUSHING 1', k, v);
				o.push(v);
				p.push(k);
			} else {
				k = p[i] + '.' + k;
				i = o.indexOf(v);
				if (i < 0) {
					//console.log('PUSHING 2', k, v);
					o.push(v);
					p.push(k);
				}
			}
		}
		if (typeof v === 'function') {
			v = '~-=(){}=-~' + k;
			//console.log('REPL!', k, p, o);
		}
		return v;
	}

	var s = JSON.stringify(x, replacer);
	//console.log(s);
	return s;
}

function par0(x) {
	var a = JSON.parse(x);
	return a;
}

function par1(x) {
	var a = JSON.parse(s, function(k, v) {
		if (typeof v === 'string' && v.substring(0,10) === '~-=(){}=-~') {
			v = function(){};
		}
		return v;
	});
	return a;
}

function par2(x) {

	var fns = {};

	function reviver(k, v) {
		if (typeof v === 'string' && v.substring(0,10) === '~-=(){}=-~') {
			var fid = v.substring(10);
			v = function(){};
			fns[fid] = v;
		}
		return v;
	}

	var a = JSON.parse(s, reviver);
	return [a, fns];
}

var xx = [x, x];

function drill(obj, path) {
	if (Array.isArray(path)) {
		for (var i = 0, l = path.length; i < l; i++) {
			part = path[i];
			obj = obj && obj[part];
		}
		return obj;
	} else if (path == null) {
		return obj;
	} else {
		return obj[path];
	}
}

function invoke(list, filter, path) {
	var args = Array.prototype.slice.call(arguments, 2);
	for (var i = 0, l = list.length; i < l; ++i) {
		var item = list[i];
		var fn = drill(item, path);
		if (fn && fn.apply) fn.apply(item, args);
	}
}
//invoke(xx, ['Foo', 'Bar', 'f2'], 12, 13, 15);

function stringy(obj) {
	for (var k in obj) if has(obj, k) { var v = obj[k];
		if (_.isFunction(v) && !v.id) {
			obj[k] = '!!!' + k;
		}
	}
}

process.exit(0);

var n = 100000;
var i, t1, t2;

//str2(x); process.exit(0);

t1 = new Date();
for (i = 0; i < n; ++i) {
	var s = str0(x);
	var a = par0(s);
}
t2 = new Date();
console.log('DONE PLAIN', 1000*n/(t2-t1), s, a);

t1 = new Date();
for (i = 0; i < n; ++i) {
	var s = str2(x);
	var a = par2(s);
}
t2 = new Date();
console.log('DONE REPLACER/REVIVER', 1000*n/(t2-t1), s, a);
