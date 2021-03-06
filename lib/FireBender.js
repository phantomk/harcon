let _ = require('isa.js')

let FlowBuilder = require('../util/FlowBuilder')
let FlowReader = require('../util/FlowReader')
let Parser = require('harcon-flow')

let vindication = require('vindication.js')

module.exports = {
	name: 'FireBender',
	auditor: true,
	bender: true,
	init: async function (options) {
		let self = this

		this.harconlog( null, 'FireBender initiated...', options, 'info' )
		this.options = options

		this.defs = this.options.defs || {}
		if ( _.isString(self.defs) )
			self.defs = FlowReader.readFlows( self.defs )
		if ( Array.isArray(self.defs) ) {
			let flows = await Parser.generateDefs(self.defs, {})
			self.defs = flows.defs
		}
		await self.buildFlow( )
		return 'ok'
	},
	buildFlow: async function ( ) {
		for (let key in this.defs)
			if ( this.defs[key].timeout )
				this.firestarter.blower.addToleration( { event: key, timeout: this.defs[key].timeout } )

		let roots = await FlowBuilder.build( this.defs )
		return roots
	},
	addExecution: function (event, def) {
		this.defs[ event ] = { type: def.type, primers: def.primers, validation: def.validation, timeout: def.timeout }
	},
	removeExecution: function (event) {
		delete this.defs[ event ]
	},
	completeness: async function ( terms, ignite ) {
		let entities = await ignite( null, null, this.division, 'Inflicter.entities', '' )
		let checkList = {}
		for (let key in this.defs) {
			let entity = key.split('.')
			if ( !checkList[ entity[0] ] ) checkList[ entity[0] ] = []
			if ( !checkList[ entity[0] ].includes(entity[1]) )
				checkList[ entity[0] ].push( entity[1] )
		}
		for (let key in checkList) {
			let entity = entities.find( (entity) => { return entity.name === key } )
			if ( !entity ) continue

			checkList[key] = checkList[key].filter( (event) => { return !entity.events.includes(event) } )

			if ( checkList[key].length === 0 )
				delete checkList[key]
		}

		return checkList
	},
	validateFlow: async function (primer, flowId, err, res) {
		let self = this

		let errMessage = err ? err.message || err.toString() : ''
		self.harconlog( null, 'Flow terminated', { flowId: flowId, err: errMessage, res: res }, 'trace' )
		if ( !self.defs[primer] ) {
			let entities = await self.ignite( '', flowId, self.division, 'Inflicter.entities', '' )
			for ( let entity of entities ) {
				if (err)
					await self.ignite( '', flowId, entity.division, entity.name + '.flowFailed', flowId, errMessage )
				else
					await self.ignite( '', flowId, entity.division, entity.name + '.flowSucceeded', flowId, res )
			}
		}
		return 'ok'
	},
	spreadFire: function ( primers, res, terms, ignite ) {
		let self = this
		let promises = []
		primers.forEach( function (primer) {
			let event = primer.event || primer
			promises.push( ignite( terms.sourceComm.externalId, terms.sourceComm.flowId, primer.division || self.division, event, res ) )
		} )
		return Promise.all( promises )
	},
	performEachStep: async function ( primer, data, terms, ignite ) {
		let self = this
		let res = []
		for (let d of data) {
			res.push( await self.performStep( primer, d, terms, ignite ) )
		}
		return res
	},
	performStep: async function ( primer, res, terms, ignite ) {
		let self = this
		return await ignite( terms.sourceComm.externalId, terms.sourceComm.flowId, primer.division || self.division, primer.event || primer, res )
	},
	simpleFire: async function ( primer, res, terms, ignite ) {
		let self = this

		let allowed = true
		if ( primer.skipIf )
			allowed = _.isFunction( primer.skipIf ) ? !primer.skipIf(res) : (await ignite( terms.sourceComm.externalId, terms.sourceComm.flowId, primer.division || self.division, primer.skipIf, res )).allowed
		return !allowed ? res : await self[ primer.foreach ? 'performEachStep' : 'performStep']( primer, res, terms, ignite )
	},
	seriesFire: function ( primers, data, terms, ignite ) {
		let self = this

		return new Promise( async (resolve, reject) => {
			if ( primers.length === 0 ) return resolve( data )

			try {
				let res = []
				for (let primer of primers) {
					res.push( await self.simpleFire( primer, data, terms, ignite ) )
				}
				if (self.options.igniteTermination)
					await self.validateFlow( primers[ primers.length - 1 ], terms.sourceComm.flowId, null, res )
				resolve( res )
			} catch ( err ) {
				if (self.options.igniteTermination)
					await self.validateFlow( primers[ primers.length - 1 ], terms.sourceComm.flowId, err )
				reject(err)
			}
		} )
	},
	waterfallFire: function ( primers, data, terms, ignite ) {
		let self = this

		return new Promise( async (resolve, reject) => {
			if ( primers.length === 0 ) return reject( null, data )

			let res = []
			try {
				for (let primer of primers) {
					res.push( await self.simpleFire( primer, (res.length === 0) ? data : res[ res.length - 1 ], terms, ignite ) )
				}
				var last = res.pop()
				if (self.options.igniteTermination)
					await self.validateFlow( primers[ primers.length - 1 ], terms.sourceComm.flowId, null, last )
				resolve( last )
			} catch (err) {
				if (self.options.igniteTermination)
					await self.validateFlow( primers[ primers.length - 1 ], terms.sourceComm.flowId, err )
				reject( err )
			}
		} )
	},
	exec: async function ( division, event, parameters, terms, ignite ) {
		let self = this

		division = division || self.division
		var divEvent = division + '.' + event

		if ( !this.defs[event] && !this.defs[divEvent] )
			throw new Error('Unknown event to trigger: ' + event)

		let action = self.defs[event] || self.defs[divEvent]

		if ( parameters.length > 1 )
			throw new Error('1 message object in total can be exchanged between entities!')
		if ( action.validation ) {
			if ( _.isFunction(action.validation) ) {
				if ( !action.validation(parameters[0]) )
					throw new Error('Validation failed')
			}
			else if ( _.isObject(action.validation) ) {
				let validation = vindication.validate(parameters[0], action.validation)
				if (validation)
					throw new Error('Validation failed. ' + validation )
			}
		}

		let as = [ terms.sourceComm.externalId, terms.sourceComm.flowId, division, event ]
		Array.prototype.push.apply( as, parameters )

		let res = await ignite.apply( self, as )
		return await self[ (action.type || 'series') + 'Fire' ]( action.primers || [], self.options.unfoldAnswer ? res : res[0], terms, ignite )
	}
}
