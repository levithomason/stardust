import faker from 'faker'
import _ from 'lodash'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import * as semanticUIReact from 'semantic-ui-react'

import { assertBodyContains, consoleUtil, sandbox, syntheticEvent } from 'test/utils'
import helpers from './commonHelpers'

/**
 * Assert Component conforms to guidelines that are applicable to all components.
 * @param {React.Component|Function} Component A component that should conform.
 * @param {Object} [options={}]
 * @param {Object} [options.eventTargets={}] Map of events and the child component to target.
 * @param {boolean} [options.rendersChildren=false] Does this component render any children?
 * @param {boolean} [options.rendersPortal=false] Does this component render a Portal powered component?
 * @param {Object} [options.requiredProps={}] Props required to render Component without errors or warnings.
 */
export default (Component, options = {}) => {
  const {
    eventTargets = {},
    requiredProps = {},
    rendersChildren = true,
    rendersPortal = false,
  } = options
  const { throwError } = helpers('isConformant', Component)

  const componentType = typeof Component

  // make sure components are properly exported
  if (componentType !== 'function') {
    throwError(`Components should export a class or function, got: ${componentType}.`)
  }

  // tests depend on Component constructor names, enforce them
  const constructorName = Component.prototype.constructor.name
  if (!constructorName) {
    throwError(
      [
        'Component is not a named function. This should help identify it:\n\n',
        `${ReactDOMServer.renderToStaticMarkup(<Component />)}`,
      ].join(''),
    )
  }

  // ----------------------------------------
  // Component info
  // ----------------------------------------
  // This is pretty ugly because:
  // - jest doesn't support custom error messages
  // - jest will run all test
  const infoJSONPath = `docs/src/componentInfo/${Component.displayName}.info.json`

  let info

  try {
    info = require(infoJSONPath)
  } catch (err) {
    // handled in the test() below
    test('component info file exists', () => {
      throw new Error(
        [
          '!! ==========================================================',
          `!! Missing ${infoJSONPath}.`,
          '!! Run `yarn test` or `yarn test:watch` again to generate one.',
          '!! ==========================================================',
        ].join('\n'),
      )
    })
    return
  }

  // ----------------------------------------
  // Class and file name
  // ----------------------------------------
  test(`constructor name matches filename "${constructorName}"`, () => {
    expect(constructorName).toEqual(info.filenameWithoutExt)
  })

  // ----------------------------------------
  // Is exported or private
  // ----------------------------------------
  // detect components like: semanticUIReact.H1
  const isTopLevelAPIProp = _.has(semanticUIReact, constructorName)

  // find the apiPath in the semanticUIReact object
  const foundAsSubcomponent = _.isFunction(_.get(semanticUIReact, info.apiPath))

  // require all components to be exported at the top level
  test('is exported at the top level', () => {
    expect(isTopLevelAPIProp).to.equal(
      true,
      [`"${info.displayName}" must be exported at top level.`, 'Export it in `src/index.js`.'].join(
        ' ',
      ),
    )
  })

  if (info.isChild) {
    test('is a static component on its parent', () => {
      expect(foundAsSubcomponent).to.equal(
        true,
        `\`${info.displayName}\` is a child component (is in ${info.repoPath}).` +
          ` It must be a static prop of its parent \`${info.parentDisplayName}\``,
      )
    })
  }

  // ----------------------------------------
  // Props
  // ----------------------------------------
  if (rendersChildren) {
    test('spreads user props', () => {
      const propName = 'data-is-conformant-spread-props'
      const props = { [propName]: true }

      shallow(<Component {...requiredProps} {...props} />).should.have.descendants(props)
    })
  }

  if (rendersChildren && !rendersPortal) {
    describe('"as" prop (common)', () => {
      test('renders the component as HTML tags or passes "as" to the next component', () => {
        // silence element nesting warnings
        consoleUtil.disableOnce()

        const tags = [
          'a',
          'em',
          'div',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'i',
          'p',
          'span',
          'strong',
        ]
        try {
          tags.forEach((tag) => {
            shallow(<Component {...requiredProps} as={tag} />).should.have.tagName(tag)
          })
        } catch (err) {
          tags.forEach((tag) => {
            const wrapper = shallow(<Component {...requiredProps} as={tag} />)
            wrapper.type().should.not.equal(Component)
            wrapper.should.have.prop('as', tag)
          })
        }
      })

      test('renders as a functional component or passes "as" to the next component', () => {
        const MyComponent = () => null

        try {
          shallow(<Component {...requiredProps} as={MyComponent} />)
            .type()
            .should.equal(MyComponent)
        } catch (err) {
          const wrapper = shallow(<Component {...requiredProps} as={MyComponent} />)
          wrapper.type().should.not.equal(Component)
          wrapper.should.have.prop('as', MyComponent)
        }
      })

      test('renders as a ReactClass or passes "as" to the next component', () => {
        // eslint-disable-next-line react/prefer-stateless-function
        class MyComponent extends React.Component {
          render() {
            return <div data-my-react-class />
          }
        }

        try {
          shallow(<Component {...requiredProps} as={MyComponent} />)
            .type()
            .should.equal(MyComponent)
        } catch (err) {
          const wrapper = shallow(<Component {...requiredProps} as={MyComponent} />)
          wrapper.type().should.not.equal(Component)
          wrapper.should.have.prop('as', MyComponent)
        }
      })

      test('passes extra props to the component it is renders as', () => {
        const MyComponent = () => null

        shallow(
          <Component {...requiredProps} as={MyComponent} data-extra-prop='foo' />,
        ).should.have.descendants('[data-extra-prop="foo"]')
      })
    })
  }

  describe('handles props', () => {
    test('defines handled props in Component.handledProps', () => {
      Component.should.have.any.keys('handledProps')
      Component.handledProps.should.be.an('array')
    })

    test('Component.handledProps includes all handled props', () => {
      const computedProps = _.union(
        Component.autoControlledProps,
        _.keys(Component.defaultProps),
        _.keys(Component.propTypes),
      )
      const expectedProps = _.uniq(computedProps).sort()

      Component.handledProps.should.to.deep.equal(
        expectedProps,
        'It seems that not all props were defined in Component.handledProps, you need to check that they are equal ' +
          'to the union of Component.autoControlledProps and keys of Component.defaultProps and Component.propTypes',
      )
    })
  })

  // ----------------------------------------
  // Events
  // ----------------------------------------
  if (rendersChildren) {
    test('handles events transparently', () => {
      // Events should be handled transparently, working just as they would in vanilla React.
      // Example, both of these handler()s should be called with the same event:
      //
      //   <Button onClick={handler} />
      //   <button onClick={handler} />
      //
      // This test catches the case where a developer forgot to call the event prop
      // after handling it internally. It also catch cases where the synthetic event was not passed back.
      _.each(syntheticEvent.types, ({ eventShape, listeners }) => {
        _.each(listeners, (listenerName) => {
          // onKeyDown => keyDown
          const eventName = _.camelCase(listenerName.replace('on', ''))

          // onKeyDown => handleKeyDown
          const handlerName = _.camelCase(listenerName.replace('on', 'handle'))

          const handlerSpy = sandbox.spy()
          const props = {
            ...requiredProps,
            [listenerName]: handlerSpy,
            'data-simulate-event-here': true,
          }

          const wrapper = shallow(<Component {...props} />)

          const eventTarget = eventTargets[listenerName]
            ? wrapper.find(eventTargets[listenerName])
            : wrapper.find('[data-simulate-event-here]')

          eventTarget.simulate(eventName, eventShape)

          // give event listeners opportunity to cleanup
          if (wrapper.instance() && wrapper.instance().componentWillUnmount) {
            wrapper.instance().componentWillUnmount()
          }

          // <Dropdown onBlur={handleBlur} />
          //                   ^ was not called once on "blur"
          const leftPad = ' '.repeat(info.displayName.length + listenerName.length + 3)

          handlerSpy.calledOnce.should.equal(
            true,
            `<${info.displayName} ${listenerName}={${handlerName}} />\n` +
              `${leftPad} ^ was not called once on "${eventName}".` +
              'You may need to hoist your event handlers up to the root element.\n',
          )

          let expectedArgs = [eventShape]
          let errorMessage = 'was not called with (event)'

          if (_.has(Component.propTypes, listenerName)) {
            expectedArgs = [eventShape, props]
            errorMessage = 'was not called with (event, data)'
          }

          // Components should return the event first, then any data
          handlerSpy
            .calledWithMatch(...expectedArgs)
            .should.equal(
              true,
              [
                `<${info.displayName} ${listenerName}={${handlerName}} />\n`,
                `${leftPad} ^ ${errorMessage}`,
                'It was called with args:',
                JSON.stringify(handlerSpy.args, null, 2),
              ].join('\n'),
            )
        })
      })
    })
  }

  // ----------------------------------------
  // Has no deprecated _meta
  // ----------------------------------------
  describe('_meta', () => {
    test('does not exist', () => {
      expect(Component._meta).to.be.undefined()
    })
  })

  // ----------------------------------------
  // Handles className
  // ----------------------------------------
  if (!rendersChildren) {
    return
  }
  describe('className (common)', () => {
    test(`has the Semantic UI className "${info.componentClassName}"`, () => {
      const wrapper = render(<Component {...requiredProps} />)
      // don't test components with no className at all (i.e. MessageItem)
      if (wrapper.prop('className')) {
        wrapper.should.have.className(info.componentClassName)
      }
    })

    test("applies user's className to root component", () => {
      const className = 'is-conformant-class-string'

      // Portal powered components can render to two elements, a trigger and the actual component
      // The actual component is shown when the portal is open
      // If a trigger is rendered, open the portal and make assertions on the portal element
      if (rendersPortal) {
        const mountNode = document.createElement('div')
        document.body.appendChild(mountNode)

        const wrapper = mount(<Component {...requiredProps} className={className} />, {
          attachTo: mountNode,
        })
        wrapper.setProps({ open: true })

        // portals/popups/etc may render the component to somewhere besides descendants
        // we look for the component anywhere in the DOM
        assertBodyContains(`.${className}`)

        wrapper.detach()
        document.body.removeChild(mountNode)
      } else {
        shallow(<Component {...requiredProps} className={className} />).should.have.className(
          className,
        )
      }
    })

    test("user's className does not override the default classes", () => {
      const defaultClasses = shallow(<Component {...requiredProps} />).prop('className')

      if (!defaultClasses) return

      const userClasses = faker.hacker.verb()
      const mixedClasses = shallow(<Component {...requiredProps} className={userClasses} />).prop(
        'className',
      )

      defaultClasses.split(' ').forEach((defaultClass) => {
        mixedClasses.should.include(
          defaultClass,
          [
            'Make sure you are using the `getUnhandledProps` util to spread the `rest` props.',
            'This may also be of help: https://facebook.github.io/react/docs/transferring-props.html.',
          ].join(' '),
        )
      })
    })
  })
}
