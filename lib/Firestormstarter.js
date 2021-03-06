let Firestarter = require('./Firestarter')

let ignorable = [ 'init', 'ignite', 'setTimeout', 'setInterval' ]

let _ = require('isa.js')

let Cerobee = require('clerobee')
let clerobee = new Cerobee( 16 )

let path = require('path')

let Assigner = require('assign.js')
let assigner = new Assigner().respect( false )

function syncFunctions (obj) {
	let res = []
	for (let m in obj)
		if ( !ignorable.includes(m) && _.isFunction(obj[m]) )
			res.push( m )
	return res
}
function asycFunctions (obj) {
	let res = []
	for (let m in obj)
		if ( !ignorable.includes(m) && _.isAsyncFunction(obj[m]) )
			res.push( m )
	return res
}

function distinguishPostfix ( distinguish ) {
	if (!distinguish) return ''

	return _.isBoolean( distinguish ) ? clerobee.generate() : distinguish
}

function isLast (array, value, defaultValue) {
	if ( array.length === 0 ) return false

	let element = array.pop()
	let found = Array.isArray(value) ? value.indexOf(element) > -1 : element === value
	if ( !found )
		array.push( element )
	return found || defaultValue
}

/**
* Firestormstarter is a wrapper for listener object where its functions are the listeners routed by its 'context' property
*
* @class Firestormstarter
* @constructor
*/
function Firestormstarter ( config, barrel, object, blower, logger ) {
	this.config = config || {}

	this.division = object.division || config.division || ''
	this.auditor = object.auditor

	this.concealed = object.concealed

	this.name = object.name || 'Unknown flames'
	this.distinguishedName = this.name + distinguishPostfix( object.distinguish )

	this.active = true

	this.context = object.context || ''

	this.path = this.context.split( '.' )
	this.pathLength = this.path.length

	this.barrel = barrel
	this.object = object

	this.logger = logger
	this.blower = blower

	this.timeoutRefs = []
	this.intervalRefs = []
	this.object = require('../util/Extender').extend( this, this.object, path.join( __dirname, 'ext' ) )

	this._syncEvents = syncFunctions( object )
	this._asyncEvents = asycFunctions( object )

	this._events = this._syncEvents.slice()
	Array.prototype.push.apply( this._events, this._asyncEvents )

	this._serviceInfo = []
	for (let i = 0; i < this._events.length; ++i) {
		let service = this._events[i]
		let params = _.parameterNames( object[ service ] )
		this._serviceInfo[ service ] = {
			async: this._asyncEvents.includes( service ),
			ignite: isLast(params, 'ignite'),
			terms: isLast(params, 'terms'),
			params: params
		}
	}

	this.object.harconlog = logger.harconlog

	this.terms = {}
}

Firestormstarter.prototype = new Firestarter()

let firestorm = Firestormstarter.prototype

firestorm.services = function ( ) {
	return this._events
}

firestorm.parameters = function ( service ) {
	return this._serviceInfo[ service ].params
}

firestorm.matches = function ( comm ) {
	if ( !comm.event || !this.sameDivision( comm.division ) ) return false

	let index = comm.event.lastIndexOf( '.' )
	let prefix = comm.event.substring(0, index)
	let fnName = comm.event.substring(index + 1)

	let matches = fnName && this._events.includes( fnName )

	if ( matches && this.name !== prefix && this.distinguishedName !== prefix ) {
		let eventPath = index === -1 ? [] : prefix.split( '.' ), len = eventPath.length
		for (let i = 0; i < len && i < this.pathLength; i += 1)
			if ( this.path[i] !== eventPath[i] ) {
				matches = false
				break
			}
	}

	this.logger.harconlog( null, 'Matching', { events: this._events, eventName: comm.event, matches: matches }, 'trace' )

	return matches
}

firestorm.getServiceInfo = function ( comm ) {
	let index = comm.event.lastIndexOf( '.' )
	let eventName = comm.event.substring( index + 1 )

	let copy = assigner.copyObject( this._serviceInfo[ eventName ] )
	copy.service = this.object[ eventName ]
	return copy
}

firestorm.close = async function ( ) {
	var self = this
	self.timeoutRefs.forEach( function (ref) {
		clearTimeout(ref)
	} )
	self.timeoutRefs.length = 0
	self.intervalRefs.forEach( function (ref) {
		clearInterval(ref)
	} )
	self.intervalRefs.length = 0

	await self.object.close( )
	return 'closed'
}

module.exports = Firestormstarter
