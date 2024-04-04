'use strict'

// Partially based on eslint-plugin-react-native.
// Portions of code by Alex Zhukov, MIT license.

function hasOnlyLineBreak(value) {
  return /^[\r\n\t\f\v]+$/.test(value.replace(/ /g, ''))
}

function getTagName(node) {
  const reversedIdentifiers = []
  if (
    node.type === 'JSXElement' &&
    node.openingElement.type === 'JSXOpeningElement'
  ) {
    let object = node.openingElement.name
    while (object.type === 'JSXMemberExpression') {
      if (object.property.type === 'JSXIdentifier') {
        reversedIdentifiers.push(object.property.name)
      }
      object = object.object
    }

    if (object.type === 'JSXIdentifier') {
      reversedIdentifiers.push(object.name)
    }
  }

  return reversedIdentifiers.reverse().join('.')
}

exports.create = function create(context) {
  const options = context.options[0] || {}
  const impliedTextProps = options.impliedTextProps ?? []
  const impliedTextComponents = options.impliedTextComponents ?? []
  const textProps = [...impliedTextProps]
  const textComponents = ['Text', ...impliedTextComponents]
  return {
    JSXText(node) {
      if (typeof node.value !== 'string' || hasOnlyLineBreak(node.value)) {
        return
      }
      let parent = node.parent
      while (parent) {
        if (parent.type === 'JSXElement') {
          const tagName = getTagName(parent)
          if (textComponents.includes(tagName) || tagName.endsWith('Text')) {
            // We're good.
            return
          }
          if (tagName === 'Trans') {
            // Skip over it and check above.
            // TODO: Maybe validate that it's present.
            parent = parent.parent
            continue
          }
          let message = 'Wrap this string in <Text>.'
          if (tagName !== 'View') {
            message +=
              ' If <' +
              tagName +
              '> is guaranteed to render <Text>, ' +
              'rename it to <' +
              tagName +
              'Text> or add it to impliedTextComponents.'
          }
          context.report({
            node,
            message,
          })
          return
        }

        if (
          parent.type === 'JSXAttribute' &&
          parent.name.type === 'JSXIdentifier' &&
          parent.parent.type === 'JSXOpeningElement' &&
          parent.parent.parent.type === 'JSXElement'
        ) {
          const tagName = getTagName(parent.parent.parent)
          const propName = parent.name.name
          if (
            textProps.includes(tagName + ' ' + propName) ||
            propName === 'text' ||
            propName.endsWith('Text')
          ) {
            // We're good.
            return
          }
          const message =
            'Wrap this string in <Text>.' +
            ' If `' +
            propName +
            '` is guaranteed to be wrapped in <Text>, ' +
            'rename it to `' +
            propName +
            'Text' +
            '` or add it to impliedTextProps.'
          context.report({
            node,
            message,
          })
          return
        }

        parent = parent.parent
        continue
      }
    },
  }
}
