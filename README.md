# nano-storage
A tiny javascript storage using indexeddb engine to store data in browser.

This project is created because we have been using `Dexie` which is 81kb in size, and in some projects, we only required a few functions from `Dexie`.
So with `NanoStorage` which is only 3kb we can use it whenever we are working on a small project that requires basic indexeddb usage.

With `NanoStorage` we can easily switch to and flow between `Dexie` and `NanoStorage` just by changing the initialization class.

##### Dexie
```js 
   var db = new Dexie("FriendDatabase");
    db.version(1).stores({
      friends: `
        id,
        name,
        age`,
    });
    db.friends.put( {id: 1, name: "Peter", age: 21 });
```

##### NanoStorage
```js 
   var db = new NanoStorage("FriendDatabase");
    db.version(1).stores({
      friends: `
        id,
        name,
        age`,
    });
    db.friends.put( {id: 1, name: "Peter", age: 21 });
```
