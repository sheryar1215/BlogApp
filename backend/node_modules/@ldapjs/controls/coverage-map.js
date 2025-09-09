module.exports = testFile => {
  if (testFile.startsWith('virtual-list-view-request-control') === true) {
    // Do not count towards coverage as it is disabled.
    return false
  }

  if (testFile.startsWith('virtual-list-view-response-control') === true) {
    // Do not count towards coverage as it is disabled.
    return false
  }

  testFile.replace(/\.test\.js$/, '.js')
}
