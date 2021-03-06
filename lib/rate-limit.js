const attempts = {}

export default function rateLimit (instance, maxRetry = 5) {
  instance.interceptors.response.use(function (response) {
    // we don't need to do anything here
    return response
  }, function (error) {
    const {request, response, config} = error
    if ((!request && !response) || !config || !instance.defaults.retryOnError) {
      return Promise.reject(error)
    }

    let retryErrorType = null
    let wait = 0

    if (!response) {
      // Errors without response or config did not recieve anything from the server
      retryErrorType = 'Connection'
    } else if (response.status >= 500 && response.status < 600) {
      // 5** errors are server related
      retryErrorType = `Server ${response.status}`
      const headers = response.headers || {}
      const requestId = headers['x-contentful-request-id'] || null
      attempts[requestId] = attempts[requestId] || 0
      attempts[requestId]++

      // we reject if there are too much errors of with the same request id
      if (attempts[requestId] >= maxRetry || !requestId) {
        return Promise.reject(error)
      }
      wait = Math.pow(Math.SQRT2, attempts[requestId])
    } else if (response.status === 429) {
      // 429 errors are exceeded rate limit exceptions
      retryErrorType = 'Rate limit'
      // all headers are lowercased by axios https://github.com/mzabriskie/axios/issues/413
      if (response.headers && error.response.headers['x-contentful-ratelimit-reset']) {
        wait = response.headers['x-contentful-ratelimit-reset']
      }
    }

    if (retryErrorType) {
      // convert to ms and add jitter
      wait = Math.floor(wait * 1000 + (Math.random() * 200) + 500)
      console.log(`${retryErrorType} error occured. Waiting for ${wait} ms before retrying....`)
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(instance(config))
        }, wait)
      })
    }
    return Promise.reject(error)
  })
}
